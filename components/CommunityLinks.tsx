// Shared community links — one place so every game + the site link the same way.
// Add Discord/Telegram here later and they appear everywhere at once.

const LINKS: { label: string; href: string; icon: string; text: string }[] = [
  { label: "Follow @gamerplex_com on X", href: "https://x.com/gamerplex_com", icon: "𝕏", text: "@gamerplex_com" },
  { label: "Join @gamerplex_com on Telegram", href: "https://t.me/gamerplex_com", icon: "✈", text: "Telegram" },
];

export default function CommunityLinks({ tone = "dark", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const fg = tone === "light" ? "#fff" : "#c8bfe6";
  const border = tone === "light" ? "rgba(255,255,255,0.4)" : "rgba(153,69,255,0.4)";
  const bg = tone === "light" ? "rgba(255,255,255,0.12)" : "rgba(153,69,255,0.10)";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.label}
          title={l.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 36,
            padding: compact ? "0 12px" : "0 16px",
            borderRadius: 99,
            border: `1px solid ${border}`,
            background: bg,
            color: fg,
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 900 }}>{l.icon}</span>
          {!compact && <span>{l.text}</span>}
        </a>
      ))}
    </div>
  );
}
