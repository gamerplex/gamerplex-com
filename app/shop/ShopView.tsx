"use client";

// Gamerplex Shop — power-ups (consumables) + cosmetics, priced in Credits
// (earned free by playing) or $GAME (bought via Flipcash; sink-only). Design per
// the Fable spec: dual-currency cards, purchase bottom-sheet, Flipcash shortfall
// handoff, owned-state flip. Compliant: no price/investment language, no gacha,
// $GAME never a reward, cosmetics account-bound. Mobile-WebView-clean (safe-area,
// no own bottom nav, no horizontal scroll).

import { useEffect, useMemo, useState } from "react";

import StarterPackOffer from "../../components/shop/StarterPackOffer";
import { getCredits } from "../../lib/identity/client";
import { track } from "../../lib/analytics";
import { quote, formatGame, formatUsd } from "../../lib/arcade/pricing";

const FLIPCASH_GAME = "https://app.flipcash.com/token/7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE";

type Cat = "power" | "cosmetic";
interface Item {
  id: string;
  cat: Cat;
  name: string;
  emoji: string;
  qty?: number;
  desc: string;
  cr?: number; // Credits price (absent = $GAME-exclusive)
  gm?: number; // legacy fixed $GAME price — superseded by `usd` where set
  // Price of record, in USD. The $GAME amount is derived from it at spot and is
  // 20% cheaper; see lib/arcade/pricing.ts for why the discount cannot take the
  // price under $1.
  usd?: number;
  exclusive?: boolean;
  badge?: string;
  featured?: boolean;
  starter?: boolean;
  accent: string;
}

const CATALOG: Item[] = [
  { id: "solstice", cat: "cosmetic", name: "Solstice Set", emoji: "🌅", desc: "Season One trail + frame + board skin.", gm: 18, exclusive: true, badge: "SEASONAL", accent: "#ffaa00" },
  { id: "starter", cat: "power", name: "Starter Pack", emoji: "🎁", desc: "5 continues + a board skin. One per player.", gm: 4, badge: "BEST VALUE", starter: true, accent: "#14F195" },
  { id: "continue", cat: "power", name: "Continue", emoji: "▶", qty: 1, desc: "Resume a run right where you died.", cr: 400, gm: 3, accent: "#14F195" },
  { id: "continue5", cat: "power", name: "Continues", emoji: "⏩", qty: 5, desc: "Five continues, banked for later.", cr: 1800, gm: 12, badge: "5 FOR 4", accent: "#14F195" },
  { id: "retry", cat: "power", name: "Instant Retry", emoji: "↻", qty: 3, desc: "Restart instantly, keep your seed.", cr: 600, gm: 4, accent: "#4fc3f7" },
  { id: "surge", cat: "power", name: "Score Surge", emoji: "⚡", qty: 1, desc: "1.5× points for one run. Casual modes only — ranked stays fair.", cr: 900, gm: 6, accent: "#f553bf" },
  { id: "neon", cat: "cosmetic", name: "Neon Wake", emoji: "💫", desc: "Glowing trail behind your ball / snake.", cr: 2400, gm: 15, accent: "#35e0ff" },
  { id: "void", cat: "cosmetic", name: "Void Chrome", emoji: "🖤", desc: "Liquid-metal board skin. Goes further in $GAME.", cr: 3200, gm: 18, accent: "#9945FF" },
  { id: "founder", cat: "cosmetic", name: "Founder Frame", emoji: "👑", desc: "Profile frame — $GAME-exclusive, this season only.", gm: 22, exclusive: true, badge: "$GAME EXCLUSIVE", accent: "#ffaa00" },
  { id: "pixel", cat: "cosmetic", name: "Pixel Trail", emoji: "🟩", desc: "Retro 8-bit particle trail.", cr: 1200, gm: 8, accent: "#14F195" },
  { id: "theme-neon-grid", cat: "cosmetic", name: "Neon Grid", emoji: "📺", desc: "Site theme — plum-black CRT, magenta/cyan split, scanlines and a horizon grid. Applies everywhere.", usd: 1.5, exclusive: true, badge: "SITE THEME", featured: true, accent: "#ff2e88" },
];

// Human label for an item id, taken from CATALOG so the Flipcash pack cannot
// describe an item differently from the rest of the shop. qty is part of the
// identity here ("continue5" IS five continues), so it belongs in the name.
function nameFor(id: string): string {
  const it = CATALOG.find((c) => c.id === id);
  if (!it) return id;
  const base = it.cat === "cosmetic" && id.startsWith("theme-") ? `${it.name} theme` : it.name;
  return it.qty && it.qty > 1 ? `${it.qty} × ${base}` : base;
}

type Filter = "all" | "power" | "cosmetic" | "owned";

/**
 * Can this be bought on the web at all? Credits spend server-side; a USD price goes
 * through Flipcash. A $GAME-only price has NO checkout here, so showing it priced and
 * tappable advertised something nobody could buy.
 */
function payable(i: Item, fcPrice?: number | null): boolean {
  return i.cr != null || i.usd != null || (fcPrice != null && fcPrice > 0);
}

/** A balance we could not read is "—". Never 0 — that reads as "you are broke". */
function fmtBal(v: number | null | undefined, dp: number): string {
  return v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function ShopView() {
  const [credits, setCredits] = useState<number | null>(null);
  // Real Flipcash holdings, read from the Code VM server-side. null = UNKNOWN (not
  // linked, or the read failed) and must render as "—", never as 0: the whole reason
  // this exists is that a confident 0 was shown to someone holding 841M $GAME.
  const [fc, setFc] = useState<{ linked: boolean; game: number | null; usdf: number | null } | null>(null);
  // Shelf prices, from the server. The shop never keeps its own copy of a price --
  // the first person to notice a mismatch would be a paying customer.
  const [fcPrices, setFcPrices] = useState<Record<string, { usd: number; usdInGame: number }>>({});
  // The Flipcash leg of a purchase: which asset, and the order once created.
  const [fcMint, setFcMint] = useState<"game" | "usdf">("game");
  const [order, setOrder] = useState<{ usd: number; itemId: string; mint: string } | null>(null);
  const [ordering, setOrdering] = useState(false);
  // Real ownership from the server. This was hardcoded to ["pixel"], so every
  // visitor saw Pixel Trail as owned and nothing they bought survived a reload.
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [sheet, setSheet] = useState<{ item: Item; cur: "cr" | "gm" } | null>(null);
  const [status, setStatus] = useState<"idle" | "confirming" | "done">("idle");
  const [buyError, setBuyError] = useState<string | null>(null);
  const [usdPerGame, setUsdPerGame] = useState<number | null>(null);

  useEffect(() => {
    void fetch("/api/flipcash/prices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setFcPrices((j?.items ?? {}) as Record<string, { usd: number; usdInGame: number }>))
      .catch(() => setFcPrices({}));
    void fetch("/api/flipcash/balances", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setFc)
      .catch(() => setFc(null));
    void getCredits().then((c) => setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0));
    // Durable ownership, so "Owned" survives a reload and a different device.
    void fetch("/api/inventory", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((b: { items?: { itemId?: string }[] }) => {
        setOwned(new Set((b.items ?? []).map((i) => i.itemId).filter(Boolean) as string[]));
      })
      .catch(() => { /* signed out or offline — nothing is owned */ });
    // Spot, for items priced in USD. A failure leaves the USD side showing and
    // the $GAME figure hidden, rather than quoting a stale number.
    void fetch("/api/game-price", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { usdPerGame?: number } | null) => {
        if (b && typeof b.usdPerGame === "number") setUsdPerGame(b.usdPerGame);
      })
      .catch(() => { /* USD price still renders */ });
    track("shop_view", {});
  }, []);

  const items = useMemo(() => {
    if (filter === "owned") return CATALOG.filter((i) => owned.has(i.id));
    if (filter === "power" || filter === "cosmetic") return CATALOG.filter((i) => i.cat === filter && !i.featured && !i.starter && payable(i, fcPrices[i.id]?.usd));
    return CATALOG.filter((i) => !i.featured && !i.starter && payable(i, fcPrices[i.id]?.usd));
  }, [filter, owned]);

  const featured = CATALOG.find((i) => i.featured && payable(i, fcPrices[i.id]?.usd));

  function openSheet(item: Item, cur?: "cr" | "gm") {
    if (owned.has(item.id)) return;
    // Default to the currency that can actually complete a purchase. This used to
    // prefer $GAME whenever an item had a $GAME price — which is all 11 of them — so
    // every shopper landed on the one path that cannot check out on web.
    const def = cur ?? (item.cr != null ? "cr" : "gm");
    setSheet({ item, cur: def });
    setStatus("idle");
    setBuyError(null);
    track("item_sheet_open", { item: item.id, entry: cur ?? "card" });
  }

  async function confirm() {
    if (!sheet) return;
    const { item, cur } = sheet;
    track("purchase_confirmed", { item: item.id, currency: cur });
    // $GAME spend isn't wired on web yet (needs an on-chain transfer via the wallet).
    // This used to `return` silently, so a player holding enough $GAME tapped
    // "Confirm — N $GAME" and NOTHING happened: no error, no state change, button
    // still live. The sheet no longer offers Confirm for $GAME (see render), so this
    // is now only a guard — and it says something if it is ever reached.
    if (cur === "gm") {
      setBuyError("$GAME checkout isn't available on the web yet.");
      track("purchase_failed", { item: item.id, reason: "gm_not_wired" });
      return;
    }
    setBuyError(null);
    setStatus("confirming");
    // Real server-side spend: deduct Credits + record ownership, atomically. Only
    // mark owned on SUCCESS (was previously optimistic and never verified).
    const r = await fetch("/api/credits/spend", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item: item.id, refId: `${item.id}:${Date.now()}` }),
    }).then((res) => res.json()).catch(() => ({ error: "network" }));
    if (r?.error) {
      setStatus("idle");
      setBuyError(
        r.error === "insufficient" ? "Not enough Credits." :
        r.error === "not_signed_in" ? "Sign in to buy." :
        "Couldn’t complete — try again.",
      );
      track("purchase_failed", { item: item.id, reason: r.error });
      return;
    }
    setOwned((s) => new Set(s).add(item.id));
    if (typeof r.appBalance === "number") setCredits(r.appBalance);
    else if (item.cr != null) setCredits((c) => (c == null ? c : c - item.cr!));
    track("purchase_succeeded", { item: item.id });
    setStatus("done");
  }


  return (
    <div className="shop">
      <style>{CSS}</style>

      <header className="sh-head">
        <h1 className="sh-title">Shop</h1>
        <div className="sh-bal">
          <span className="pill cr" title="Credits — earned by playing">⬡ {credits == null ? "—" : credits.toLocaleString()}</span>
          <a className="pill usdf gx-transfer" href={FLIPCASH_GAME} target="_blank" rel="noopener noreferrer" title="Dollars held in Flipcash">
            $ {fmtBal(fc?.usdf, 2)}
          </a>
          <a className="pill gm gx-transfer" href={FLIPCASH_GAME} target="_blank" rel="noopener noreferrer" title="$GAME held in Flipcash">
            ◆ {fmtBal(fc?.game, 0)}
          </a>
        </div>
      </header>

      <div className="sh-filters">
        {(["all", "power", "cosmetic", "owned"] as Filter[]).map((f) => (
          <button key={f} className={`fchip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "power" ? "Power-ups" : f === "cosmetic" ? "Cosmetics" : "Owned"}
          </button>
        ))}
      </div>

      {filter === "all" && featured && (
        <button className="feat" style={{ ["--a" as string]: featured.accent }} onClick={() => openSheet(featured)}>
          <span className="feat-badge">{featured.badge}</span>
          <span className="feat-emoji">{featured.emoji}</span>
          <span className="feat-name">{featured.name}</span>
          <span className="feat-desc">{featured.desc}</span>
          <span className="feat-price"><span className="pg">{featured.usd != null ? formatUsd(featured.usd) : `⬡ ${featured.cr?.toLocaleString()}`}</span>{featured.usd != null ? " · pay with Flipcash" : " · Credits"}</span>
        </button>
      )}

      {/* The Starter Pack, paid in Flipcash. This replaces the old gm-priced
          starter hero, which opened a sheet that could never actually charge. */}
      {filter === "all" && (
        <StarterPackOffer
          nameFor={nameFor}
          owned={owned.has("theme-neon-grid") && owned.has("continue5")}
        />
      )}

      <div className="grid">
        {items.map((it) => <Card key={it.id} it={it} owned={owned.has(it.id)} onOpen={openSheet} usdPerGame={usdPerGame} />)}
        {items.length === 0 && (
          <div className="empty">Nothing here yet — <a href="/#featured">play a run</a> to earn Credits.</div>
        )}
      </div>

      <p className="foot">Credits are earned free by playing. $GAME is a community token you top up on Flipcash and spend across Gamerplex — it goes further per item. Cosmetics are account-bound and never affect gameplay.</p>

      {sheet && (
        <div className="scrim" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {status === "done" ? (
              <div className="ok">
                <div className="ok-ring">✓</div>
                <div className="ok-t">{sheet.item.name} is yours</div>
                <button className="cta" onClick={() => setSheet(null)}>{sheet.item.cat === "cosmetic" ? "Equip now" : "Play now"}</button>
                <button className="ghost" onClick={() => setSheet(null)}>Keep browsing</button>
              </div>
            ) : (
              <>
                <div className="sh-item"><span className="sh-emoji" style={{ background: `${sheet.item.accent}22` }}>{sheet.item.emoji}</span>
                  <div><div className="sh-nm">{sheet.item.name}{sheet.item.qty ? ` ×${sheet.item.qty}` : ""}</div><div className="sh-ds">{sheet.item.desc}</div></div>
                </div>
                <div className="curs">
                  {sheet.item.usd != null && (() => {
                    const q = quote(sheet.item.usd, usdPerGame);
                    return (
                      <div className="cur">
                        <span className="cur-tag">20% OFF IN $GAME</span>
                        <span className="cur-p">
                          {q.game != null ? <>◆ {formatGame(q.game)}</> : formatUsd(q.usdInGame)}
                        </span>
                        <span className="cur-h">
                          {formatUsd(sheet.item.usd)} in stablecoin · you pay {formatUsd(q.usdInGame)}
                        </span>
                      </div>
                    );
                  })()}
                  {fcPrices[sheet.item.id] && (
                    <button className={`cur gm ${sheet.cur === "gm" ? "on" : ""}`} onClick={() => setSheet({ ...sheet, cur: "gm" })}>
                      <span className="cur-tag">20% OFF IN $GAME</span>
                      <span className="cur-p">{formatUsd(fcPrices[sheet.item.id].usdInGame)}</span>
                      <span className="cur-h">pay with Flipcash</span>
                    </button>
                  )}
                  {sheet.item.cr != null && (
                    <button className={`cur cr ${sheet.cur === "cr" ? "on" : ""}`} onClick={() => setSheet({ ...sheet, cur: "cr" })}>
                      <span className="cur-tag">EARNED FREE</span><span className="cur-p">⬡ {sheet.item.cr.toLocaleString()}</span><span className="cur-h">You have {credits ?? "—"}</span>
                    </button>
                  )}
                </div>
                {sheet.cur === "cr" && sheet.item.cr != null && credits != null && credits < sheet.item.cr ? (
                  <>
                    <div className="warn">Not enough Credits yet.</div>
                    <a className="cta" href="/#featured">Earn Credits — play a run</a>
                  </>
                ) : sheet.cur === "gm" ? (
                  order && order.itemId === sheet.item.id ? (
                    <>
                      {/* The amount is FIAT on purpose: a Flipcash buyer types an amount
                          their client converts through the bonding curve, so a $GAME
                          quantity is an instruction nobody can follow. */}
                      <div className="fc-amt">Send <b>{formatUsd(order.usd)}</b> in {order.mint === "game" ? "$GAME" : "Dollars"}</div>
                      <a
                        className="cta gx-transfer"
                        href={FLIPCASH_GAME}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => track("flipcash_handoff_start", { item: sheet.item.id, priceUsd: order.usd })}
                      >
                        Open @gamerplex and pay
                      </a>
                      <div className="hint">
                        We will confirm in the chat the moment it lands, and your item unlocks here.
                        Opening the chat for the first time costs Flipcash&apos;s $1 minimum.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="fc-pick">
                        <button className={`fc-opt ${fcMint === "game" ? "on" : ""}`} onClick={() => setFcMint("game")}>
                          $GAME <span>{formatUsd(fcPrices[sheet.item.id]?.usdInGame ?? 0)}</span>
                        </button>
                        <button className={`fc-opt ${fcMint === "usdf" ? "on" : ""}`} onClick={() => setFcMint("usdf")}>
                          Dollars <span>{formatUsd(fcPrices[sheet.item.id]?.usd ?? 0)}</span>
                        </button>
                      </div>
                      <button
                        className="cta"
                        disabled={ordering}
                        onClick={async () => {
                          setOrdering(true);
                          setBuyError(null);
                          const r = await fetch("/api/flipcash/order", {
                            method: "POST",
                            credentials: "include",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ itemId: sheet.item.id, mint: fcMint }),
                          }).then((x) => x.json()).catch(() => ({ error: "network" }));
                          setOrdering(false);
                          if (r?.error) {
                            // A rate we cannot read is not a reason to quote a guess.
                            setBuyError(
                              r.error === "rate_unavailable"
                                ? "Can't price $GAME right now — pay in Dollars instead."
                                : r.error === "not_signed_in" ? "Sign in first."
                                : "Couldn't start that purchase.",
                            );
                            if (r.payInUsdfInstead) setFcMint("usdf");
                            return;
                          }
                          setOrder({ usd: r.usd, itemId: r.itemId, mint: r.mint });
                          track("flipcash_order_created", { item: sheet.item.id, mint: fcMint, priceUsd: r.usd });
                        }}
                      >
                        {ordering ? "Starting…" : "Pay with Flipcash"}
                      </button>
                      {buyError && <div className="warn" style={{ marginTop: 10 }}>{buyError}</div>}
                    </>
                  )
                ) : (
                  <>
                    <button className="cta" onClick={confirm} disabled={status === "confirming"}>
                      {status === "confirming" ? "Confirming…" : `Confirm — ${sheet.item.cr?.toLocaleString()} Credits`}
                    </button>
                    {buyError && <div className="warn" style={{ marginTop: 10 }}>{buyError}</div>}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ it, owned, onOpen, usdPerGame }: { it: Item; owned: boolean; onOpen: (i: Item, c?: "cr" | "gm") => void; usdPerGame: number | null }) {
  const q = it.usd != null ? quote(it.usd, usdPerGame) : null;
  return (
    <div className={`card ${owned ? "owned" : ""}`} style={{ ["--a" as string]: it.accent }} onClick={() => onOpen(it)}>
      {it.badge && !owned && <span className="c-badge">{it.badge}</span>}
      <div className="c-art"><span>{it.emoji}</span></div>
      <div className="c-nm">{it.name}{it.qty ? ` ×${it.qty}` : ""}</div>
      <div className="c-ds">{it.desc}</div>
      {owned ? (
        <div className="c-owned">✓ OWNED</div>
      ) : (
        <div className="c-prices">
          {it.cr != null && <button className="pchip cr" onClick={(e) => { e.stopPropagation(); onOpen(it, "cr"); }}>⬡ {it.cr.toLocaleString()}</button>}
          {it.usd != null ? (
            <button className="pchip gm" onClick={(e) => { e.stopPropagation(); onOpen(it, "gm"); }}>
              {formatUsd(it.usd)}{q && q.game != null ? <> · ◆ {formatGame(q.game)}</> : null}
            </button>
          ) : it.gm != null ? (
            <button className="pchip gm" onClick={(e) => { e.stopPropagation(); onOpen(it, "gm"); }}>◆ {it.gm}</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

const CSS = `
.shop{--cr:#14F195;--gm:#9945FF;--glass:rgba(255,255,255,.055);--gb:rgba(255,255,255,.09);
  min-height:100vh;background:radial-gradient(90% 60% at 20% -10%,rgba(153,69,255,.28),transparent 60%),#0d001a;
  color:#e8e8f0;font-family:'Space Grotesk',system-ui,sans-serif;
  padding:0 14px calc(84px + env(safe-area-inset-bottom));max-width:460px;margin:0 auto;overflow-x:hidden;font-variant-numeric:tabular-nums;}
.sh-head{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:14px 2px 12px;background:linear-gradient(#0d001a,rgba(13,0,26,.86));backdrop-filter:blur(8px);}
.sh-title{font-size:22px;font-weight:900;letter-spacing:-.5px;}
.sh-bal{display:flex;gap:8px;}
.pill{font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px;text-decoration:none;letter-spacing:.3px;}
.pill.cr{color:var(--cr);border:1px solid rgba(20,241,149,.4);background:rgba(20,241,149,.08);}
.pill.gm{color:#fff;background:var(--gm);box-shadow:0 0 16px rgba(153,69,255,.5);}
/* Dollars held in Flipcash. Its own colour so it is not read as Credits. */
.fc-amt{margin:4px 0 10px;font-size:15px;color:#f4f2fb;text-align:center;font-variant-numeric:tabular-nums;}
.fc-pick{display:flex;gap:8px;margin:2px 0 12px;}
.fc-opt{flex:1;min-height:52px;border-radius:12px;border:1px solid var(--gb);background:var(--glass);
  color:#cfc7e8;font-size:13px;font-weight:700;display:flex;flex-direction:column;gap:2px;
  align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;}
.fc-opt span{font-size:15px;color:#fff;font-variant-numeric:tabular-nums;}
.fc-opt.on{border-color:var(--gm);box-shadow:0 0 0 1px var(--gm) inset;}
@media (hover:hover) and (pointer:fine){ .fc-opt:hover{border-color:var(--gm);} }
.fc-opt:active{transform:translateY(1px);}
.pill.usdf{color:#dff7e9;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.07);}
.sh-bal .pill{font-variant-numeric:tabular-nums;}
.sh-filters{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px;scrollbar-width:none;}
.sh-filters::-webkit-scrollbar{display:none;}
.fchip{flex:0 0 auto;font-size:13px;font-weight:700;padding:8px 14px;border-radius:999px;border:1px solid var(--gb);background:var(--glass);color:#b0b0c8;cursor:pointer;}
.fchip.on{background:#fff;color:#0d001a;border-color:#fff;}
.feat{width:100%;text-align:left;border:1px solid var(--gb);background:linear-gradient(150deg,color-mix(in srgb,var(--a) 22%,transparent),var(--glass));backdrop-filter:blur(14px);border-radius:22px;padding:20px;margin-bottom:12px;display:flex;flex-direction:column;gap:4px;cursor:pointer;position:relative;}
.feat-badge{align-self:flex-start;font-family:monospace;font-size:10px;font-weight:800;letter-spacing:1px;color:#0d001a;background:var(--a);padding:3px 8px;border-radius:6px;}
.feat-emoji{font-size:40px;margin:6px 0;}
.feat-name{font-size:22px;font-weight:900;letter-spacing:-.5px;}
.feat-desc{font-size:13px;color:#c8c8da;}
.feat-price{margin-top:8px;font-size:12px;color:#b0b0c8;}
.feat-price .pg{color:#fff;background:var(--gm);padding:3px 10px;border-radius:999px;font-weight:800;box-shadow:0 0 14px rgba(153,69,255,.5);}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.card{border:1px solid var(--gb);background:var(--glass);backdrop-filter:blur(14px);border-radius:18px;padding:12px;cursor:pointer;position:relative;display:flex;flex-direction:column;gap:6px;transition:transform .14s ease;}
.card:active{transform:scale(.98);}
.card.owned{opacity:.55;cursor:default;}
.c-badge{position:absolute;top:8px;left:8px;font-family:monospace;font-size:9px;font-weight:800;letter-spacing:.5px;color:#0d001a;background:var(--a);padding:2px 6px;border-radius:5px;}
.c-art{aspect-ratio:16/11;border-radius:12px;background:radial-gradient(70% 70% at 50% 40%,color-mix(in srgb,var(--a) 40%,transparent),rgba(255,255,255,.03));display:flex;align-items:center;justify-content:center;}
.c-art span{font-size:38px;}
.c-nm{font-size:15px;font-weight:800;letter-spacing:-.3px;}
.c-ds{font-size:11.5px;line-height:1.42;color:#b0b0c8;min-height:2.84em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.c-prices{display:flex;gap:6px;margin-top:2px;}
.pchip{font-size:13px;font-weight:800;padding:6px 10px;border-radius:10px;cursor:pointer;border:none;font-family:inherit;}
.pchip.cr{color:var(--cr);background:transparent;border:1px solid rgba(20,241,149,.45);}
.pchip.gm{color:#fff;background:var(--gm);box-shadow:0 0 12px rgba(153,69,255,.45);}
.c-owned{font-size:12px;font-weight:800;color:var(--cr);letter-spacing:1px;padding:6px 0 2px;}
.empty{grid-column:1/-1;text-align:center;color:#b0b0c8;font-size:13px;padding:30px 0;}
.empty a{color:var(--cr);font-weight:800;}
.foot{font-size:11px;color:#7f7a95;line-height:1.6;margin:22px 2px 8px;}
.scrim{position:fixed;inset:0;z-index:40;background:rgba(4,0,12,.66);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;}
.sheet{width:100%;max-width:460px;background:#140922;border:1px solid var(--gb);border-bottom:none;border-radius:22px 22px 0 0;padding:22px 18px calc(24px + env(safe-area-inset-bottom));animation:up .28s cubic-bezier(.32,.9,.35,1);}
@keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.sh-item{display:flex;gap:12px;align-items:center;margin-bottom:16px;}
.sh-emoji{width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;}
.sh-nm{font-size:17px;font-weight:800;}
.sh-ds{font-size:12.5px;color:#b0b0c8;margin-top:2px;}
.curs{display:flex;gap:10px;margin-bottom:14px;}
.cur{flex:1;border-radius:14px;padding:12px;cursor:pointer;font-family:inherit;text-align:left;display:flex;flex-direction:column;gap:3px;border:1.5px solid var(--gb);background:var(--glass);}
.cur.on.gm{border-color:var(--gm);background:rgba(153,69,255,.16);}
.cur.on.cr{border-color:var(--cr);background:rgba(20,241,149,.12);}
.cur-tag{font-family:monospace;font-size:9px;font-weight:800;letter-spacing:.5px;color:#8f8aa5;}
.cur.gm .cur-tag{color:var(--gm);}
.cur-p{font-size:20px;font-weight:900;}
.cur.gm .cur-p{color:#fff;}.cur.cr .cur-p{color:var(--cr);}
.cur-h{font-size:11px;color:#8f8aa5;}
.cta{display:block;width:100%;text-align:center;border:none;font-family:inherit;font-size:16px;font-weight:800;padding:15px;border-radius:14px;background:var(--gm);color:#fff;cursor:pointer;text-decoration:none;box-shadow:0 8px 28px rgba(153,69,255,.4);}
.cta.topup{background:var(--cr);color:#0d001a;box-shadow:0 8px 28px rgba(20,241,149,.4);}
.cta[disabled]{opacity:.7;}
.warn{font-size:13px;font-weight:700;color:#ffcf6b;margin-bottom:10px;}
.hint{font-size:12px;color:#8f8aa5;margin-top:10px;line-height:1.5;}
.lnk,.ghost{background:none;border:none;font-family:inherit;cursor:pointer;}
.lnk{color:var(--cr);font-weight:700;font-size:12px;padding:0;}
.ghost{color:#8f8aa5;font-size:13px;width:100%;margin-top:10px;}
.ok{text-align:center;padding:8px 0;}
.ok-ring{width:60px;height:60px;border-radius:50%;border:3px solid var(--cr);color:var(--cr);display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 12px;}
.ok-t{font-size:18px;font-weight:800;margin-bottom:16px;}
@media (prefers-reduced-motion:reduce){.sheet{animation:none;}.card{transition:none;}}
`;
