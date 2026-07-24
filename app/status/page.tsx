"use client";

// Public status page. Generic, user-facing categories only — the real probes run
// server-side in /api/status, so no backend host/vendor/service names ever reach the
// browser. Small traffic-light table + an overall banner. Auto-refreshes every 30s.

import { useEffect, useState } from "react";

type Light = "operational" | "degraded" | "down";
type Cat = { category: string; status: Light };
type Status = { overall: Light; categories: Cat[]; checkedAt: string };

const DOT: Record<Light, string> = { operational: "#14F195", degraded: "#ffb020", down: "#ff5470" };
const LABEL: Record<Light, string> = { operational: "Operational", degraded: "Degraded", down: "Outage" };
const OVERALL: Record<Light, string> = {
  operational: "All systems operational",
  degraded: "Some systems degraded",
  down: "We’re investigating an issue",
};

export default function StatusPage() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: Status) => live && (setS(d), setErr(false)))
        .catch(() => live && setErr(true));
    load();
    const iv = setInterval(load, 30_000);
    return () => { live = false; clearInterval(iv); };
  }, []);

  const overall: Light = err ? "down" : s?.overall ?? "operational";

  return (
    <main style={wrap}>
      <a href="/" style={brand}>GAMERPLEX</a>
      <h1 style={h1}>System Status</h1>

      <div style={{ ...banner, borderColor: DOT[overall], background: `${DOT[overall]}14` }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: DOT[overall], boxShadow: `0 0 10px ${DOT[overall]}` }} />
        <span style={{ fontWeight: 800, fontSize: 16 }}>{err ? "Status check unavailable" : OVERALL[overall]}</span>
      </div>

      <div style={table}>
        {(s?.categories ?? PLACEHOLDER).map((c) => (
          <div key={c.category} style={row}>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{c.category}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: DOT[c.status], fontWeight: 700 }}>{LABEL[c.status]}</span>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: DOT[c.status] }} />
            </span>
          </div>
        ))}
      </div>

      <p style={foot}>
        {s?.checkedAt ? `Last checked ${new Date(s.checkedAt).toLocaleTimeString()}` : "Checking…"} · refreshes automatically
      </p>
    </main>
  );
}

const PLACEHOLDER: Cat[] = [
  { category: "Games & Gameplay", status: "operational" },
  { category: "Accounts & Sign-in", status: "operational" },
  { category: "Credits & Leaderboards", status: "operational" },
  { category: "Analytics", status: "operational" },
];

const wrap: React.CSSProperties = {
  minHeight: "100vh", background: "radial-gradient(120% 80% at 50% -10%,#1a0838,#0a0118 60%)",
  color: "#ece7ff", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  padding: "22px 18px 60px", maxWidth: 560, margin: "0 auto",
};
const brand: React.CSSProperties = { display: "inline-block", fontWeight: 900, letterSpacing: 1, fontSize: 15, color: "#fff", textDecoration: "none", opacity: 0.9 };
const h1: React.CSSProperties = { fontSize: 26, fontWeight: 900, margin: "28px 0 16px" };
const banner: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, border: "1px solid", borderRadius: 14, padding: "14px 16px", marginBottom: 20 };
const table: React.CSSProperties = { border: "1px solid rgba(153,69,255,0.28)", borderRadius: 14, overflow: "hidden" };
const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" };
const foot: React.CSSProperties = { fontSize: 12.5, color: "#8a80b0", marginTop: 16, textAlign: "center" };
