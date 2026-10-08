"use client";

// Waits for the grant, then celebrates. Three honest states: waiting, arrived, and
// taking-longer-than-expected — never a success it has not verified.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { track } from "../../../lib/analytics";

const POLL_MS = 4000;
/** After this we stop implying it is imminent and tell them what to do. */
const SLOW_AFTER_MS = 90_000;

const BLURB: Record<string, { name: string; does: string }> = {
  neon: { name: "Neon Wake", does: "Your trail glows behind you in every run." },
  void: { name: "Void Chrome", does: "A liquid-metal board skin, everywhere you play." },
  pixel: { name: "Pixel Trail", does: "A retro 8-bit particle trail." },
  solstice: { name: "Solstice Set", does: "Season One trail, frame and board skin." },
  founder: { name: "Founder Frame", does: "A profile frame, this season only." },
  continue: { name: "Continue", does: "Resume a run right where you died." },
  continue5: { name: "5 Continues", does: "Banked and ready whenever a run ends badly." },
  retry: { name: "Instant Retry", does: "Restart instantly and keep your seed." },
  surge: { name: "Score Surge", does: "1.5x points for one run, casual modes." },
  "theme-neon-grid": { name: "Neon Grid", does: "A site-wide CRT theme with scanlines." },
};

export default function PurchaseSuccess() {
  const params = useSearchParams();
  const item = params.get("item") ?? "";
  const [state, setState] = useState<"waiting" | "arrived" | "slow">("waiting");
  const started = useRef(Date.now());
  const fired = useRef(false);

  useEffect(() => {
    if (!item) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/inventory", { credentials: "include", cache: "no-store" });
        const b = (await r.json()) as { items?: { itemId?: string }[] };
        if (!alive) return;
        if ((b.items ?? []).some((i) => i.itemId === item)) {
          setState("arrived");
          if (!fired.current) { fired.current = true; track("purchase_succeeded", { item, via: "flipcash" }); }
          return; // stop polling
        }
        if (Date.now() - started.current > SLOW_AFTER_MS) setState("slow");
      } catch { /* offline — keep waiting rather than claiming failure */ }
      if (alive) setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { alive = false; };
  }, [item]);

  const info = BLURB[item];
  const arrived = state === "arrived";

  return (
    <main className="ps">
      <style>{CSS}</style>
      <div className={`ps-card ${arrived ? "in" : ""}`}>
        <div className="ps-badge" aria-hidden="true">{arrived ? "✓" : "◆"}</div>
        <h1 className="ps-title">
          {arrived ? "It's yours" : state === "slow" ? "Still waiting on the payment" : "Waiting for your payment"}
        </h1>
        <p className="ps-item">{info?.name ?? item ?? "Your purchase"}</p>
        {arrived ? (
          <>
            <p className="ps-does">{info?.does ?? "It is unlocked on your account."}</p>
            <Link className="ps-cta" href="/app/play">Go play</Link>
            <Link className="ps-alt" href="/shop">Back to the shop</Link>
          </>
        ) : state === "slow" ? (
          <>
            {/* Never claim it failed: the money may be in flight. Say what is true and
                what they can do. */}
            <p className="ps-does">
              We haven&apos;t seen it land yet. Payments usually confirm in seconds, so if you
              have already sent it, give it another minute — this page updates by itself.
            </p>
            <Link className="ps-cta" href="/shop">Back to the shop</Link>
          </>
        ) : (
          <>
            <p className="ps-does">
              Send the amount in the @gamerplex chat. This page unlocks the moment it arrives —
              you don&apos;t need to refresh.
            </p>
            <div className="ps-dots" aria-label="Waiting"><span /><span /><span /></div>
          </>
        )}
      </div>
    </main>
  );
}

const CSS = `
.ps{min-height:100svh;display:grid;place-items:center;padding:24px 16px;}
.ps-card{width:100%;max-width:440px;text-align:center;padding:30px 22px 26px;border-radius:20px;
  border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.055);}
.ps-badge{width:62px;height:62px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;
  font-size:27px;color:#fff;background:linear-gradient(135deg,#9945ff,#ff2e88);}
.ps-card.in .ps-badge{background:linear-gradient(135deg,#14F195,#35e0ff);animation:ps-pop .5s var(--lg-spring,cubic-bezier(.2,1.2,.3,1)) both;}
.ps-title{margin:0 0 4px;font-size:23px;font-weight:800;letter-spacing:-.02em;text-wrap:balance;}
.ps-item{margin:0 0 10px;font-size:15px;font-weight:700;color:#cfc7e8;}
.ps-does{margin:0 0 18px;font-size:13.5px;line-height:1.55;color:#9a92b5;}
.ps-cta{display:inline-flex;min-height:46px;align-items:center;padding:0 20px;border-radius:999px;
  background:linear-gradient(135deg,#9945ff,#ff2e88);color:#fff;font-weight:800;font-size:14.5px;
  text-decoration:none;touch-action:manipulation;}
.ps-alt{display:block;margin-top:12px;font-size:13px;color:#9a92b5;}
.ps-dots{display:flex;gap:7px;justify-content:center;}
.ps-dots span{width:7px;height:7px;border-radius:50%;background:#9945ff;animation:ps-b 1.3s ease-in-out infinite;}
.ps-dots span:nth-child(2){animation-delay:.18s}
.ps-dots span:nth-child(3){animation-delay:.36s}
@keyframes ps-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ps-b{0%,80%,100%{opacity:.28}40%{opacity:1}}
@media (hover:hover) and (pointer:fine){ .ps-cta:hover{filter:brightness(1.08);} }
.ps-cta:active{transform:translateY(1px);}
/* Celebration is decoration; motion sensitivity outranks it. */
@media (prefers-reduced-motion:reduce){
  .ps-card.in .ps-badge{animation:none}
  .ps-dots span{animation:none;opacity:.6}
}
`;
