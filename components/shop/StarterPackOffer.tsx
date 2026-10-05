"use client";

// The Starter Pack offer — the one purchase that also creates the account.
//
// It is the only way into the Flipcash rail from the web, because Flipcash will
// not transfer under $1 and the DM that carries the receipt costs that much to
// open. So the first payment has to buy something worth it, and everything cheaper
// happens afterwards inside that same conversation.
//
// MERCHANDISING, HONESTLY. The value anchor is arithmetic on the catalogue's own
// prices, and the deadline is the real one the SERVER enforces — after it, the
// theme genuinely stops being granted. Deliberately absent: a per-visitor
// countdown that restarts on reload, invented stock counts, and "N people are
// looking at this". Those would be misrepresentations, and the urgency here does
// not need to be invented.

import { useEffect, useState } from "react";

import { track } from "../../lib/analytics";

interface Pack {
  label: string;
  items: Array<{ id: string; type: string }>;
  base: Array<{ id: string; type: string }>;
  promo: { active: boolean; until: string; items: Array<{ id: string; type: string }> };
  credits: number;
  worth: { credits: number; promoUsd: number };
}

interface Intent {
  payUrl: string;
  qr: string;
  priceUsd: number;
  pack: Pack;
}

/** Days left, floored, from a fixed shared deadline — not a per-visitor timer. */
function daysLeft(until: string): number {
  const ms = new Date(until).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

export default function StarterPackOffer({
  nameFor,
  owned,
}: {
  nameFor: (id: string) => string;
  owned: boolean;
}) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [failed, setFailed] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [handedOff, setHandedOff] = useState(false);

  useEffect(() => {
    if (owned) return;
    let live = true;
    fetch("/api/flipcash/intent")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Intent) => live && setIntent(j))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [owned]);

  // Owning it, or not being able to describe it accurately, both mean show nothing.
  if (owned || failed || !intent) return null;

  const { pack, payUrl, priceUsd } = intent;
  const promoItem = pack.promo.active ? pack.promo.items[0] : null;
  const left = pack.promo.active ? daysLeft(pack.promo.until) : 0;

  const pay = () => {
    track("flipcash_handoff_start", { tier: "starter-pack", priceUsd });
    setHandedOff(true);
    // Opens the Flipcash app where installed; otherwise their web page, which
    // offers the download. Either way the user ends up somewhere useful.
    window.location.href = payUrl;
  };

  return (
    <section className="fcp" aria-labelledby="fcp-h">
      <style>{CSS}</style>

      <div className="fcp-head">
        <div>
          <div className="fcp-kicker">Best value · one-off</div>
          <h2 className="fcp-h" id="fcp-h">
            {pack.label}
          </h2>
        </div>
        <div className="fcp-price">
          <b>${priceUsd.toFixed(2)}</b>
          <span>with Flipcash</span>
        </div>
      </div>

      <ul className="fcp-items">
        {pack.base.map((i) => (
          <li key={i.id}>
            <span className="fcp-tick" aria-hidden="true">
              ✓
            </span>
            {nameFor(i.id)}
          </li>
        ))}
        {promoItem && (
          <li className="fcp-promo">
            <span className="fcp-tick" aria-hidden="true">
              ★
            </span>
            {nameFor(promoItem.id)}
            <span className="fcp-free">
              included free{left > 0 ? ` · ${left} day${left === 1 ? "" : "s"} left` : " · ends today"}
            </span>
          </li>
        )}
        <li>
          <span className="fcp-tick" aria-hidden="true">
            ✓
          </span>
          {pack.credits} Credits
        </li>
      </ul>

      <div className="fcp-worth">
        {pack.worth.credits.toLocaleString()} Credits of power-ups
        {pack.worth.promoUsd > 0 && <> + the ${pack.worth.promoUsd.toFixed(2)} site theme</>}
      </div>

      {/* What the buyer must actually DO, verified against a real purchase on
          2026-10-05. Two earlier versions of this were wrong: the chat-init fee is
          charged only on the FIRST chat ever opened, so a returning buyer can never
          pay that way, and a buyer cannot enter a $GAME quantity at all — the
          Flipcash client sends a fiat amount and converts. So: an amount, with the
          $ button, in the chat. */}
      <ol className="fcp-steps gx-transfer">
        <li>Flipcash opens a chat with <b>@gamerplex</b>.</li>
        <li>
          Tap the <b>$ button</b> and send <b>${priceUsd.toFixed(2)}</b> of $GAME (your own
          currency is fine — Flipcash converts).
        </li>
        <li>Your pack and a one-tap sign-in link come straight back in that chat.</li>
      </ol>

      {/* The money-movement control: hidden in store builds by gx-transfer. */}
      <div className="fcp-cta gx-transfer">
        <button className="fcp-btn" onClick={pay}>
          Pay ${priceUsd.toFixed(2)} with Flipcash
        </button>
        <button
          className="fcp-alt"
          onClick={() => {
            setShowQr((v) => !v);
            if (!showQr) track("flipcash_qr_shown", { tier: "starter-pack" });
          }}
          aria-expanded={showQr}
        >
          {showQr ? "Hide QR" : "Scan on your phone"}
        </button>
      </div>

      {showQr && (
        <div className="fcp-qr gx-transfer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={intent.qr} alt={`QR code to pay $${priceUsd.toFixed(2)} with Flipcash`} width={176} height={176} />
          <p>Scan with Flipcash, then send {`$${priceUsd.toFixed(2)}`} of $GAME in the chat with the $ button.</p>
        </div>
      )}

      {handedOff && (
        <p className="fcp-wait gx-transfer" role="status">
          Waiting for your payment. Opening the chat does not charge anything — you have to send
          the amount with the <b>$</b> button. It usually unlocks within a few seconds of arriving.
        </p>
      )}

      <p className="fcp-note">
        No password. Your sign-in link arrives in the Flipcash chat, and everything you buy after
        this can be paid for in that same conversation — no second payment to sign in again.
      </p>
    </section>
  );
}

const CSS = `
.fcp{border:1px solid var(--shell-line,#2a1b3d);border-radius:16px;padding:16px;margin:0 0 18px;
  background:linear-gradient(160deg,rgba(255,46,136,.10),rgba(0,0,0,0) 60%),var(--shell-card,#140a22)}
.fcp-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.fcp-kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#ff2e88;font-weight:700}
.fcp-h{margin:2px 0 0;font-size:20px;line-height:1.2}
.fcp-price{text-align:right;white-space:nowrap}
.fcp-price b{display:block;font-size:24px;font-variant-numeric:tabular-nums}
.fcp-price span{font-size:11px;opacity:.7}
.fcp-items{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:7px}
.fcp-items li{display:flex;align-items:baseline;gap:8px;font-size:14px;flex-wrap:wrap}
.fcp-tick{color:#39ffd0;font-weight:700}
.fcp-promo .fcp-tick{color:#ffd23f}
.fcp-free{font-size:11px;font-weight:700;color:#ffd23f;border:1px solid rgba(255,210,63,.45);
  border-radius:999px;padding:1px 8px}
.fcp-worth{margin-top:12px;font-size:12px;opacity:.72}
.fcp-cta{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.fcp-btn{flex:1 1 200px;min-height:46px;border:0;border-radius:11px;cursor:pointer;
  font-size:15px;font-weight:700;color:#12001f;background:linear-gradient(135deg,#ff2e88,#ffd23f)}
.fcp-alt{min-height:46px;padding:0 14px;border-radius:11px;cursor:pointer;font-size:13px;
  background:transparent;color:inherit;border:1px solid var(--shell-line,#2a1b3d)}
.fcp-qr{margin-top:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.fcp-qr img{border-radius:10px;background:#fff;padding:6px;width:176px;height:176px}
.fcp-qr p{font-size:12px;opacity:.75;margin:0}
.fcp-steps{margin:14px 0 0;padding:0 0 0 18px;display:grid;gap:5px;font-size:13px;line-height:1.45}
.fcp-steps li{padding-left:2px}
.fcp-steps b{color:#39ffd0;font-weight:700}
.fcp-wait{margin:10px 0 0;padding:9px 11px;border-radius:10px;font-size:12.5px;line-height:1.45;
  border:1px solid rgba(255,210,63,.35);background:rgba(255,210,63,.08);color:#ffd23f}
.fcp-note{margin:12px 0 0;font-size:12px;opacity:.7;line-height:1.45}
@media (max-width:420px){.fcp-price{text-align:left}.fcp-btn{flex-basis:100%}}
`;
