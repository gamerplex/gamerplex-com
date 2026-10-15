"use client";

import Link from "next/link";
import { useState } from "react";
import GlassShell from "../../components/GlassShell";
import { glassPanel } from "../../components/glass";
import { ASSETS, CATEGORIES, files, mb } from "./_data/assets";

export default function AssetsView() {
  const [cat, setCat] = useState<string>("all");
  const shown = cat === "all" ? ASSETS : ASSETS.filter((a) => a.category === cat);
  return (
    <GlassShell>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 4px 64px" }}>
        <p style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: 3, color: "#14F195", textTransform: "uppercase", marginBottom: 10 }}>
          CC0 assets
        </p>
        <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color: "#fff", marginBottom: 12 }}>
          Free 3D assets you can <span style={{ background: "linear-gradient(90deg,#9945FF,#14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>actually trace</span>.
        </h1>
        <p style={{ fontSize: 17, color: "#bbb", lineHeight: 1.6, maxWidth: 760, marginBottom: 24 }}>
          Every asset is CC0: use it in anything, commercial included, no credit needed. Each one shows how it was made, which tools and licences were
          involved, and a fingerprint of the file. No login, no paywall.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {["all", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                padding: "6px 14px", borderRadius: 999, border: "1px solid var(--border2)", cursor: "pointer", fontSize: 14,
                background: c === cat ? "var(--purple)" : "transparent", color: c === cat ? "#fff" : "var(--dim)", textTransform: "capitalize",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p style={{ color: "var(--dim)" }}>New assets are on the way.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {shown.map((a) => (
              <Link key={a.slug} href={`/assets/${a.slug}`} style={{ ...glassPanel, borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit", display: "block" }}>
                <div style={{ aspectRatio: "1 / 1", background: "radial-gradient(circle at 50% 40%, #3a2477, #170b35)" }}>
                  <img src={files(a.slug).thumb} alt={a.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <div style={{ padding: "10px 12px 12px" }}>
                  <div style={{ fontWeight: 700, color: "#fff" }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>
                    {a.category} · {a.method === "ai-assisted" ? "AI-assisted" : "procedural"} · GLB {mb(a.glb_bytes)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 32, lineHeight: 1.6 }}>
          For agents: the whole catalogue is JSON at <code>/api/assets</code>. Want to make your own? The generators are open source in the{" "}
          <Link href="/build" style={{ color: "#14F195" }}>Sovereign World Kit</Link>.
        </p>
      </div>
    </GlassShell>
  );
}
