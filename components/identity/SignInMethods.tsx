"use client";

// Which sign-in methods this account has, and how to add the rest.
//
// WHY THIS EXISTS. There are three ways in — email, a Phantom wallet, and Flipcash
// — and nothing told you which ones were attached to you. With three doors and no
// indicator, the normal outcome is a person quietly accumulating two accounts and
// wondering where their items went. Showing the state is most of the fix.
//
// ONE ACCOUNT, EVERY SITE. The methods live on a single shared identity row, so
// linking one here links it for Sledgit and Pet Legends too. Credits and items are
// per-app, which is why this says "sign in", not "balance".
//
// The blocked path is stated rather than hidden: a wallet can only be attached once
// an email is verified (it is what stops a stranger claiming your wallet), so if
// there is no verified email yet this says so instead of letting you press a button
// that returns 403.

import { useState } from "react";

import { linkedMethods, logout, type IdentityUser } from "../../lib/identity/client";

export default function SignInMethods({
  user,
  onAddEmail,
  onChanged,
}: {
  user: IdentityUser;
  onAddEmail: () => void;
  onChanged?: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const linked = linkedMethods(user);
  const count = [linked.email, linked.wallet, linked.flipcash].filter(Boolean).length;

  const doLogout = async () => {
    setSigningOut(true);
    const ok = await logout();
    if (ok) {
      // Full reload: every surface caches "who am I" independently, so a soft
      // refresh would leave parts of the page still showing the old account.
      window.location.href = "/";
      return;
    }
    setSigningOut(false);
    onChanged?.();
  };

  return (
    <div className="sim" style={PANEL}>
      <style>{CSS}</style>

      <div className="sim-head">
        <b>Sign-in methods</b>
        <span className="sim-count">
          {`${count} of 3 · works on Gamerplex, Sledgit & Pet Legends`}
        </span>
      </div>

      <ul className="sim-list">
        <Row
          icon="✉️"
          name="Email"
          on={linked.email}
          detail={linked.email ? (user.email ?? "") : "Keeps your scores if you change device"}
          action={linked.email ? null : { label: "Add email", onClick: onAddEmail }}
        />

        <Row
          icon="👻"
          name="Phantom wallet"
          on={linked.wallet}
          detail={
            linked.wallet
              ? `${user.walletAddress!.slice(0, 4)}…${user.walletAddress!.slice(-4)}`
              : linked.email
                ? "Pay with SOL, USDC or $GAME · verified on-chain scores"
                : "Verify an email first — that is what stops someone else claiming your wallet"
          }
          // No button either way. With a verified email the real controls are
          // directly below this panel; without one the endpoint would 403, so the
          // reason is stated in the detail line instead of offering a dead button.
          action={null}
        />

        <Row
          icon="⚡"
          name="Flipcash"
          on={linked.flipcash}
          detail={
            linked.flipcash
              ? "Pay in chat · receipts arrive there"
              : "One tap payments, no wallet needed"
          }
          action={
            linked.flipcash
              ? null
              : { label: "Get the Starter Pack", href: "/shop", className: "gx-transfer" }
          }
        />
      </ul>

      <button className="sim-out" onClick={doLogout} disabled={signingOut}>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function Row({
  icon,
  name,
  on,
  detail,
  action,
}: {
  icon: string;
  name: string;
  on: boolean;
  detail: string;
  action: { label: string; onClick?: (() => void) | null; href?: string; className?: string } | null;
}) {
  return (
    <li className={`sim-row ${on ? "on" : ""}`}>
      <span className="sim-ic" aria-hidden="true">
        {icon}
      </span>
      <span className="sim-body">
        <span className="sim-name">
          {name}
          {on && (
            <span className="sim-tick" aria-label="connected">
              ✓
            </span>
          )}
        </span>
        <span className="sim-detail">{detail}</span>
      </span>
      {action?.href ? (
        <a className={`sim-act ${action.className ?? ""}`} href={action.href}>
          {action.label}
        </a>
      ) : action?.onClick ? (
        <button className="sim-act" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </li>
  );
}

const PANEL: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: "16px 14px",
};

const CSS = `
.sim-head{display:flex;flex-direction:column;gap:3px;margin-bottom:12px}
.sim-head b{font-size:14px;color:#e8e8f0}
.sim-count{font-size:11px;color:#8a8aa6}
.sim-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sim-row{display:flex;align-items:center;gap:11px;padding:10px 11px;border-radius:12px;
  background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06)}
.sim-row.on{border-color:rgba(20,241,149,.32);background:rgba(20,241,149,.06)}
.sim-ic{font-size:17px;line-height:1}
.sim-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.sim-name{font-size:13px;font-weight:700;color:#e8e8f0;display:flex;align-items:center;gap:6px}
.sim-tick{color:#14F195;font-size:12px}
.sim-detail{font-size:11px;color:#8a8aa6;overflow-wrap:anywhere}
.sim-act{flex:0 0 auto;font-size:12px;font-weight:700;padding:7px 11px;border-radius:9px;
  cursor:pointer;background:rgba(255,255,255,.08);color:#e8e8f0;
  border:1px solid rgba(255,255,255,.14);text-decoration:none;white-space:nowrap}
.sim-out{margin-top:13px;width:100%;min-height:40px;border-radius:10px;cursor:pointer;
  font-size:12px;background:transparent;color:#a8a8c0;border:1px solid rgba(255,255,255,.12)}
.sim-out:disabled{opacity:.6;cursor:default}
@media (max-width:380px){.sim-row{flex-wrap:wrap}.sim-act{width:100%;text-align:center}}
`;
