import { PublicKey } from "@solana/web3.js";

const REFERRAL_SS_KEY = "gamerplex:referrer:v2";
// 7 days: the payout is gated on the referred friend finishing onboarding
// (verify email + name + save a score), which can span several sessions — the
// captured code must survive that. localStorage (not session) for the same reason.
const REFERRAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESOLVER_BASE =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

interface StoredReferral {
  pubkey: string;                 // wallet referral (web3); "" when handle-based
  handle?: string;                // handle referral (web2, the primary rail)
  source: "url-hint" | "url-hint-verified-onchain" | "url-handle";
  storedAt: number;
}

function log(reason: string, value?: string): void {
  try { console.info(`[referral] ${reason}`, value ?? ""); } catch {}
}

function safePubkey(raw: string): PublicKey | null {
  try {
    const pk = new PublicKey(raw);
    if (pk.equals(PublicKey.default)) return null;
    if (!PublicKey.isOnCurve(pk.toBytes())) return null;
    return pk;
  } catch {
    return null;
  }
}

async function resolveCanonicalReferrer(sig: string): Promise<PublicKey | null> {
  if (!sig || sig.length < 32 || sig.length > 128) return null;
  try {
    const r = await fetch(
      `${RESOLVER_BASE}/arcade/score/${encodeURIComponent(sig)}`,
      { cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok || !j?.player) return null;
    return safePubkey(j.player);
  } catch {
    return null;
  }
}

export async function pickReferrerFromUrl(
  connectedWallet: PublicKey | null = null
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("referrer") ?? params.get("ref");
    if (!raw) return;

    const hint = safePubkey(raw);
    if (!hint) {
      // Not a pubkey → a web2 referral CODE: a handle (pretty) or a userId UUID
      // (works for every user before they claim a name). Stored in `handle`.
      const code = raw.trim().toLowerCase();
      const isHandle = /^[a-z0-9_]{3,20}$/.test(code);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(code);
      if (isHandle || isUuid) {
        const payload: StoredReferral = { pubkey: "", handle: code, source: "url-handle", storedAt: Date.now() };
        window.localStorage.setItem(REFERRAL_SS_KEY, JSON.stringify(payload));
        log("accepted:url-code", code);
      } else {
        log("rejected:invalid-code", raw);
      }
      return;
    }

    if (connectedWallet && hint.equals(connectedWallet)) {
      log("rejected:self-referral", hint.toBase58());
      return;
    }

    const sig = params.get("sig");
    let canonical: PublicKey = hint;
    let source: StoredReferral["source"] = "url-hint";

    if (sig) {
      const onchain = await resolveCanonicalReferrer(sig);
      if (onchain) {
        if (!onchain.equals(hint)) {
          log("rejected:hint-mismatch-onchain-truth-wins",
            `hint=${hint.toBase58().slice(0, 8)} onchain=${onchain.toBase58().slice(0, 8)}`);
        }
        canonical = onchain;
        source = "url-hint-verified-onchain";
      } else {
        log("warning:sig-present-but-unresolved", sig.slice(0, 8));
      }
    }

    const payload: StoredReferral = {
      pubkey: canonical.toBase58(),
      source,
      storedAt: Date.now(),
    };
    window.localStorage.setItem(REFERRAL_SS_KEY, JSON.stringify(payload));
    log(`accepted:${source}`, canonical.toBase58());
  } catch (e: any) {
    log("rejected:exception", e?.message ?? String(e));
  }
}

export function getStoredReferrer(connectedWallet?: PublicKey | null): PublicKey {
  if (typeof window === "undefined") return PublicKey.default;
  try {
    const raw = window.localStorage.getItem(REFERRAL_SS_KEY);
    if (!raw) return PublicKey.default;
    const parsed = JSON.parse(raw) as StoredReferral;
    if (!parsed?.pubkey || typeof parsed.storedAt !== "number") return PublicKey.default;
    if (Date.now() - parsed.storedAt > REFERRAL_TTL_MS) {
      window.localStorage.removeItem(REFERRAL_SS_KEY);
      return PublicKey.default;
    }
    const pk = safePubkey(parsed.pubkey);
    if (!pk) return PublicKey.default;
    if (connectedWallet && pk.equals(connectedWallet)) {
      log("rejected-at-read:self-referral", pk.toBase58());
      return PublicKey.default;
    }
    return pk;
  } catch {
    return PublicKey.default;
  }
}

export function getStoredReferrerInfo(
  connectedWallet?: PublicKey | null,
): { pubkey: PublicKey; source: StoredReferral["source"] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REFERRAL_SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReferral;
    if (!parsed?.pubkey || typeof parsed.storedAt !== "number") return null;
    if (Date.now() - parsed.storedAt > REFERRAL_TTL_MS) return null;
    const pk = safePubkey(parsed.pubkey);
    if (!pk) return null;
    if (connectedWallet && pk.equals(connectedWallet)) return null;
    return { pubkey: pk, source: parsed.source };
  } catch {
    return null;
  }
}

// The stored referral code for the Credits claim — handle (web2) or wallet (web3).
// This is what ReferralClaimer sends to /api/credits/referral (which accepts both).
export function getStoredReferralCode(): { kind: "handle" | "wallet"; value: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REFERRAL_SS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredReferral;
    if (typeof p?.storedAt !== "number" || Date.now() - p.storedAt > REFERRAL_TTL_MS) return null;
    if (p.handle) return { kind: "handle", value: p.handle };
    if (p.pubkey) return { kind: "wallet", value: p.pubkey };
    return null;
  } catch {
    return null;
  }
}

export function clearReferrer(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(REFERRAL_SS_KEY); } catch {}
}

// Append the sharer's STABLE userId as ?ref=<userId> so every challenge/share
// link carries durable referral attribution. We deliberately do NOT use the
// handle: handles are mutable (a user can rename, freeing the old name for
// someone else to claim) so a handle-based link would break or mis-attribute.
// The userId is immutable; the capture side (pickReferrerFromUrl) already accepts
// a UUID, and the grant route resolves it directly.
export function buildShareUrl(base: string, referrerId?: string | null): string {
  if (!referrerId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}ref=${encodeURIComponent(referrerId)}`;
}
