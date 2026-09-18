"use client";

// Gamerplex Shop — power-ups (consumables) + cosmetics, priced in Credits
// (earned free by playing) or $GAME (bought via Flipcash; sink-only). Design per
// the Fable spec: dual-currency cards, purchase bottom-sheet, Flipcash shortfall
// handoff, owned-state flip. Compliant: no price/investment language, no gacha,
// $GAME never a reward, cosmetics account-bound. Mobile-WebView-clean (safe-area,
// no own bottom nav, no horizontal scroll).

import { useEffect, useMemo, useState } from "react";
import { getCredits, getIdentity, getGameBalance } from "../../lib/identity/client";
import { track } from "../../lib/analytics";

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
  gm?: number; // $GAME price
  exclusive?: boolean;
  badge?: string;
  featured?: boolean;
  starter?: boolean;
  accent: string;
}

const CATALOG: Item[] = [
  { id: "solstice", cat: "cosmetic", name: "Solstice Set", emoji: "🌅", desc: "Season One trail + frame + board skin.", gm: 18, exclusive: true, badge: "SEASONAL", featured: true, accent: "#ffaa00" },
  { id: "starter", cat: "power", name: "Starter Pack", emoji: "🎁", desc: "5 continues + a board skin. One per player.", gm: 4, badge: "BEST VALUE", starter: true, accent: "#14F195" },
  { id: "continue", cat: "power", name: "Continue", emoji: "▶", qty: 1, desc: "Resume a run right where you died.", cr: 400, gm: 3, accent: "#14F195" },
  { id: "continue5", cat: "power", name: "Continues", emoji: "⏩", qty: 5, desc: "Five continues, banked for later.", cr: 1800, gm: 12, badge: "5 FOR 4", accent: "#14F195" },
  { id: "retry", cat: "power", name: "Instant Retry", emoji: "↻", qty: 3, desc: "Restart instantly, keep your seed.", cr: 600, gm: 4, accent: "#4fc3f7" },
  { id: "surge", cat: "power", name: "Score Surge", emoji: "⚡", qty: 1, desc: "1.5× points for one run. Casual modes only — ranked stays fair.", cr: 900, gm: 6, accent: "#f553bf" },
  { id: "neon", cat: "cosmetic", name: "Neon Wake", emoji: "💫", desc: "Glowing trail behind your ball / snake.", cr: 2400, gm: 15, accent: "#35e0ff" },
  { id: "void", cat: "cosmetic", name: "Void Chrome", emoji: "🖤", desc: "Liquid-metal board skin. Goes further in $GAME.", cr: 3200, gm: 18, accent: "#9945FF" },
  { id: "founder", cat: "cosmetic", name: "Founder Frame", emoji: "👑", desc: "Profile frame — $GAME-exclusive, this season only.", gm: 22, exclusive: true, badge: "$GAME EXCLUSIVE", accent: "#ffaa00" },
  { id: "pixel", cat: "cosmetic", name: "Pixel Trail", emoji: "🟩", desc: "Retro 8-bit particle trail.", cr: 1200, gm: 8, accent: "#14F195" },
];

type Filter = "all" | "power" | "cosmetic" | "owned";

export default function ShopView() {
  const [credits, setCredits] = useState<number | null>(null);
  const [game, setGame] = useState<number>(0); // $GAME balance of the linked wallet
  const [owned, setOwned] = useState<Set<string>>(new Set(["pixel"]));
  const [filter, setFilter] = useState<Filter>("all");
  const [sheet, setSheet] = useState<{ item: Item; cur: "cr" | "gm" } | null>(null);
  const [status, setStatus] = useState<"idle" | "confirming" | "done">("idle");
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    void getIdentity().then((id) => getGameBalance(id?.walletAddress).then(setGame));
    void getCredits().then((c) => setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0));
    track("shop_view", {});
  }, []);

  const items = useMemo(() => {
    if (filter === "owned") return CATALOG.filter((i) => owned.has(i.id));
    if (filter === "power" || filter === "cosmetic") return CATALOG.filter((i) => i.cat === filter && !i.featured && !i.starter);
    return CATALOG.filter((i) => !i.featured && !i.starter);
  }, [filter, owned]);

  const featured = CATALOG.find((i) => i.featured);
  const starter = CATALOG.find((i) => i.starter);

  function openSheet(item: Item, cur?: "cr" | "gm") {
    if (owned.has(item.id)) return;
    const def = cur ?? (item.gm != null ? "gm" : "cr");
    setSheet({ item, cur: def });
    setStatus("idle");
    setBuyError(null);
    track("item_sheet_open", { item: item.id, entry: cur ?? "card" });
  }

  async function confirm() {
    if (!sheet) return;
    const { item, cur } = sheet;
    track("purchase_confirmed", { item: item.id, currency: cur });
    // $GAME spend isn't wired on web yet (needs an on-chain transfer via the wallet);
    // the sheet routes $GAME to Flipcash top-up, so never fake-complete a $GAME buy.
    if (cur === "gm") return;
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

  const short = sheet && sheet.cur === "gm" && sheet.item.gm != null && game < sheet.item.gm;
  const gap = short ? sheet!.item.gm! - game : 0;

  return (
    <div className="shop">
      <style>{CSS}</style>

      <header className="sh-head">
        <h1 className="sh-title">Shop</h1>
        <div className="sh-bal">
          <span className="pill cr">⬡ {credits == null ? "—" : credits.toLocaleString()}</span>
          <a className="pill gm gx-transfer" href={FLIPCASH_GAME} target="_blank" rel="noopener noreferrer">◆ {game}</a>
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
          <span className="feat-price"><span className="pg">◆ {featured.gm}</span> · $GAME exclusive</span>
        </button>
      )}

      {filter === "all" && starter && !owned.has(starter.id) && (
        <button className="starter" onClick={() => openSheet(starter)}>
          <span className="st-emoji">{starter.emoji}</span>
          <span className="st-body"><b>{starter.name}</b><span>{starter.desc}</span></span>
          <span className="st-price">◆ {starter.gm}</span>
        </button>
      )}

      <div className="grid">
        {items.map((it) => <Card key={it.id} it={it} owned={owned.has(it.id)} onOpen={openSheet} />)}
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
                  {sheet.item.gm != null && (
                    <button className={`cur gm ${sheet.cur === "gm" ? "on" : ""}`} onClick={() => setSheet({ ...sheet, cur: "gm" })}>
                      <span className="cur-tag">GOES FURTHER</span><span className="cur-p">◆ {sheet.item.gm}</span><span className="cur-h">You have {game}</span>
                    </button>
                  )}
                  {sheet.item.cr != null && (
                    <button className={`cur cr ${sheet.cur === "cr" ? "on" : ""}`} onClick={() => setSheet({ ...sheet, cur: "cr" })}>
                      <span className="cur-tag">EARNED FREE</span><span className="cur-p">⬡ {sheet.item.cr.toLocaleString()}</span><span className="cur-h">You have {credits ?? "—"}</span>
                    </button>
                  )}
                </div>
                {short ? (
                  <>
                    <div className="warn">You&apos;re {gap} $GAME short.</div>
                    <a className="cta topup gx-transfer" href={FLIPCASH_GAME} target="_blank" rel="noopener noreferrer" onClick={() => track("flipcash_handoff_start", { item: sheet.item.id, gap })}>Top up with Flipcash</a>
                    <div className="hint">You&apos;ll land right back here — your pick is saved.{sheet.item.cr != null && <> Or <button className="lnk" onClick={() => setSheet({ ...sheet, cur: "cr" })}>pay {sheet.item.cr.toLocaleString()} Credits</button>.</>}</div>
                  </>
                ) : sheet.cur === "cr" && sheet.item.cr != null && credits != null && credits < sheet.item.cr ? (
                  <>
                    <div className="warn">Not enough Credits yet.</div>
                    <a className="cta" href="/#featured">Earn Credits — play a run</a>
                  </>
                ) : (
                  <>
                    <button className="cta" onClick={confirm} disabled={status === "confirming"}>
                      {status === "confirming" ? "Confirming…" : sheet.cur === "gm" ? `Confirm — ${sheet.item.gm} $GAME` : `Confirm — ${sheet.item.cr?.toLocaleString()} Credits`}
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

function Card({ it, owned, onOpen }: { it: Item; owned: boolean; onOpen: (i: Item, c?: "cr" | "gm") => void }) {
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
          {it.gm != null && <button className="pchip gm" onClick={(e) => { e.stopPropagation(); onOpen(it, "gm"); }}>◆ {it.gm}</button>}
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
.starter{width:100%;display:flex;align-items:center;gap:12px;border:1px solid rgba(20,241,149,.4);background:rgba(20,241,149,.08);border-radius:16px;padding:12px 14px;margin-bottom:16px;cursor:pointer;color:#e8e8f0;text-align:left;}
.st-emoji{font-size:28px;}
.st-body{flex:1;display:flex;flex-direction:column;}
.st-body b{font-size:15px;}
.st-body span{font-size:12px;color:#b0b0c8;}
.st-price{color:#fff;background:var(--gm);padding:6px 12px;border-radius:999px;font-weight:800;font-size:13px;box-shadow:0 0 14px rgba(153,69,255,.5);}
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
