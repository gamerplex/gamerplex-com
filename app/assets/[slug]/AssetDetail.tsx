"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GlassShell from "../../../components/GlassShell";
import { glassPanel } from "../../../components/glass";
import AssetViewer from "../_components/AssetViewer";
import { type Asset, files, mb } from "../_data/assets";

export default function AssetDetail({ a }: { a: Asset }) {
  const f = files(a.slug);
  const [prov, setProv] = useState<Record<string, unknown> | null>(null);
  // No sign-in. The asset is CC0 — no attribution, no restriction, commercial use fine — so
  // there is no entitlement to check and a login bought us nothing but friction. It also
  // locked out the audience the page exists for: an AI agent cannot sign in.
  const download = () => { window.location.href = f.download; };
  useEffect(() => {
    fetch(f.provenance).then((r) => r.json()).then(setProv).catch(() => setProv(null));
  }, [f.provenance]);
  const models = (prov?.models as Record<string, string> | undefined) ?? {};

  return (
    <GlassShell>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 4px 64px" }}>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          <Link href="/assets" style={{ color: "var(--dim)" }}>← All assets</Link>
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(280px, 2fr)", gap: 20 }} className="asset-grid">
          <div style={{ ...glassPanel, borderRadius: 16, overflow: "hidden", aspectRatio: "4 / 3", background: "radial-gradient(circle at 50% 40%, #3a2477, #170b35)" }}>
            <AssetViewer src={f.preview} />
          </div>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{a.title}</h1>
            <p style={{ color: "#bbb", lineHeight: 1.6, marginBottom: 16 }}>{a.description}</p>
            <button
              onClick={download}
              style={{ display: "inline-block", padding: "12px 22px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(90deg,#9945FF,#14F195)", color: "#0a0a12", fontWeight: 800, fontSize: 16, marginBottom: 8 }}
            >
              Download GLB ({mb(a.glb_bytes)})
            </button>
            <p style={{ fontSize: 13, color: "var(--dim)", margin: "0 0 16px" }}>
              Full quality, 2K textures. No account, no key, no attribution required.
            </p>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 14, color: "var(--dim)" }}>
              <dt>Licence</dt>
              <dd style={{ color: "#14F195", margin: 0 }}>
                <a href="https://creativecommons.org/publicdomain/zero/1.0/" style={{ color: "#14F195" }}>CC0 1.0</a>: use it in anything, no credit needed
              </dd>
              <dt>Made</dt>
              <dd style={{ margin: 0 }}>{a.method === "ai-assisted" ? "AI-assisted" : "Procedural"}</dd>
              {a.tris ? (<><dt>Triangles</dt><dd style={{ margin: 0 }}>{a.tris.toLocaleString()}</dd></>) : null}
              {a.size_m ? (<><dt>Size</dt><dd style={{ margin: 0 }}>{a.size_m.join(" × ")} m</dd></>) : null}
              <dt>Rigged</dt>
              <dd style={{ margin: 0 }}>{a.rigged ? "Yes" : "No"}</dd>
            </dl>
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "36px 0 12px" }}>How it was made</h2>
        <div style={{ display: "grid", gridTemplateColumns: a.concept ? "minmax(0, 1fr) minmax(0, 2fr)" : "1fr", gap: 20 }} className="asset-grid">
          {a.concept ? (
            <figure style={{ margin: 0 }}>
              <img src={f.concept} alt={`Concept image ${a.title} was built from`} style={{ width: "100%", borderRadius: 12 }} />
              <figcaption style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>The concept image the 3D model was built from.</figcaption>
            </figure>
          ) : null}
          <div style={{ ...glassPanel, borderRadius: 14, padding: 16, fontSize: 14, color: "var(--dim)", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 10px" }}>{a.generator}</p>
            {Object.keys(models).length ? (
              <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
                {Object.entries(models).map(([k, v]) => (
                  <li key={k}><strong style={{ color: "#fff" }}>{k}:</strong> {v}</li>
                ))}
              </ul>
            ) : null}
            {typeof prov?.note === "string" ? <p style={{ margin: "0 0 10px" }}>{prov.note}</p> : null}
            <p style={{ margin: 0, wordBreak: "break-all" }}>
              File fingerprint (SHA-256 of the source): <code>{String(prov?.source_sha256 ?? "…")}</code>
            </p>
            <p style={{ margin: "10px 0 0" }}>
              <a href={f.provenance} style={{ color: "#14F195" }}>Full provenance record (JSON)</a>
            </p>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 760px) { .asset-grid { grid-template-columns: 1fr !important; } }`}</style>
    </GlassShell>
  );
}
