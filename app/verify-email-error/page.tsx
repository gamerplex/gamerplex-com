import Link from "next/link";

// Friendly landing for a magic-link that couldn't complete (expired, or its
// token was rotated by a newer sign-in link). Never a dead-end: always offers
// a way into the app + to request a fresh link. Reached from the identity
// service's verify-email redirect (?reason=already_used|expired|missing).

const MESSAGES: Record<string, { title: string; body: string }> = {
  already_used: {
    title: "You're likely already signed in",
    body: "This sign-in link was already used (some email apps open links automatically). If you're not in yet, just head to Gamerplex or request a fresh link.",
  },
  expired: {
    title: "That link expired",
    body: "Sign-in links are valid for 24 hours. Request a fresh one and you'll be right in.",
  },
  missing: {
    title: "Something's off with that link",
    body: "The link looks incomplete. Request a fresh sign-in link and try again.",
  },
};

export default async function VerifyEmailError({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const msg = MESSAGES[reason ?? ""] ?? MESSAGES.missing;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d001a", color: "#e8e8f0", fontFamily: "'Space Grotesk', system-ui, sans-serif", padding: "clamp(16px, 5vw, 40px)", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>✉️</div>
        <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 800, marginBottom: 10 }}>{msg.title}</h1>
        <p style={{ fontSize: 14, color: "#b0b0c8", lineHeight: 1.6, marginBottom: 24 }}>{msg.body}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/?verified=1" style={{ background: "linear-gradient(90deg,#9945FF,#14F195)", color: "#000", fontWeight: 800, padding: "12px 22px", borderRadius: 10, textDecoration: "none" }}>
            Continue to Gamerplex →
          </Link>
          <Link href="/?login=1" style={{ background: "rgba(255,255,255,0.05)", color: "#e8e8f0", fontWeight: 700, padding: "12px 22px", borderRadius: 10, textDecoration: "none", border: "1px solid rgba(153,69,255,0.4)" }}>
            Email me a new link
          </Link>
        </div>
      </div>
    </div>
  );
}
