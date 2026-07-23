"use client";

import { useEffect, useState } from "react";

// Platform-aware install page. Leads with "play now" (works everywhere incl. iOS
// via the PWA); the native app is the enhancement. Publishes the signed APK's
// fingerprints so anyone can verify authenticity — and states the ONLY official
// sources (the #1 scam vector is a reskinned wallet-drainer APK on a mirror site).

const APK_URL =
  "https://github.com/gamerplex/gamerplex-downloads/releases/latest/download/Gamerplex.apk";
const VERSION = "1.0.7";
const FILE_SHA = "9a0773da63edb5c4da4eb50c9ee9cccd2e7c55b4bfa9a31ee0e54af003af2a43";
const CERT_SHA =
  "58:0F:82:51:11:E7:A5:62:A2:A7:C9:93:4D:EF:4C:ED:6D:F7:9D:A1:04:27:4D:98:00:C4:BD:54:F7:08:79:01";

type Plat = "ios" | "android" | "desktop" | "unknown";

export default function DownloadView() {
  const [plat, setPlat] = useState<Plat>("unknown");
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (iOS) setPlat("ios");
    else if (/Android/.test(ua)) setPlat("android");
    else setPlat("desktop");
  }, []);

  return (
    <main className="dl">
      <style>{CSS}</style>
      <a className="dl-brand" href="/">GAMERPLEX</a>

      <section className="dl-hero">
        <h1>Get Gamerplex</h1>
        <p className="dl-sub">Play instantly in your browser — no install. Or add the app for wallet, streaks and offline-quick daily play.</p>
        <a className="dl-cta dl-cta-primary" href="/">▶ Play now in your browser</a>
      </section>

      {/* Platform-specific block */}
      {plat === "ios" && (
        <Card title="iPhone / iPad" tag="Install the app">
          <p>iOS installs as a home-screen app (a PWA) — no App Store needed today:</p>
          <ol className="dl-steps">
            <li>Tap the <b>Share</b> button in Safari.</li>
            <li>Choose <b>Add to Home Screen</b>.</li>
            <li>Open <b>Gamerplex</b> from your home screen — full-screen, like a native app.</li>
          </ol>
          <p className="dl-note">A native App Store build is on the way.</p>
        </Card>
      )}

      {plat === "android" && <AndroidCard />}

      {plat === "desktop" && (
        <Card title="On desktop" tag="Play here, or grab the app on your phone">
          <p>Everything runs in this browser — just hit <b>Play now</b> above. To install the app, open <b>gamerplex.com/download</b> on your phone.</p>
          <div className="dl-row">
            <a className="dl-cta" href={APK_URL} rel="noopener">Download Android APK (beta)</a>
          </div>
        </Card>
      )}

      {/* Store status */}
      <div className="dl-stores">
        <span className="dl-badge dl-badge-soon">◎ Solana dApp Store · coming soon</span>
        <span className="dl-badge dl-badge-soon">▶ Google Play · coming soon</span>
        <span className="dl-badge dl-badge-soon"> App Store · coming soon</span>
      </div>

      {/* Verification / anti-scam */}
      <section className="dl-verify">
        <h2>Verify before you install</h2>
        <p className="dl-warn">⚠ Only ever download Gamerplex from an <b>official source</b>. We will never DM you an APK or ask you to install from a mirror.</p>
        <ul className="dl-sources">
          <li><b>gamerplex.com/download</b> (this page)</li>
          <li><b>github.com/gamerplex/gamerplex-downloads</b></li>
          <li>the <b>Solana dApp Store</b> (once live)</li>
        </ul>
        <div className="dl-fp">
          <div><span>Version</span><code>{VERSION} · Android arm64</code></div>
          <div><span>File SHA-256</span><code>{FILE_SHA}</code></div>
          <div><span>Signing cert SHA-256</span><code>{CERT_SHA}</code></div>
        </div>
        <p className="dl-note">Verify a downloaded APK: <code>shasum -a 256 Gamerplex.apk</code> and <code>apksigner verify --print-certs Gamerplex.apk</code> — both must match the values above.</p>
      </section>
    </main>
  );
}

function Card({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="dl-card">
      <div className="dl-card-head"><span className="dl-card-tag">{tag}</span><h2>{title}</h2></div>
      {children}
    </section>
  );
}

function AndroidCard() {
  return (
    <Card title="Android / Solana Seeker" tag="Install the app">
      <a className="dl-cta dl-cta-primary" href={APK_URL} rel="noopener">⬇ Download Gamerplex {VERSION} (APK)</a>
      <p className="dl-note">58 MB · Android 8+ · arm64. Signed by Gamerplex (verify below).</p>
      <ol className="dl-steps">
        <li>Tap <b>Download</b> above, then open the file.</li>
        <li>If prompted, allow <b>Install unknown apps</b> for your browser (Android asks once).</li>
        <li>Install, then open <b>Gamerplex</b>.</li>
      </ol>
    </Card>
  );
}

const CSS = `
.dl{--bg:#0a0118;--panel:#140430;--edge:rgba(153,69,255,.28);--ink:#ece7ff;--dim:#9a8fc4;--grn:#14f195;--cy:#35e0ff;min-height:100vh;background:radial-gradient(120% 80% at 50% -10%,#1a0838,#0a0118 60%);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:22px 18px 80px;-webkit-font-smoothing:antialiased}
.dl-brand{display:inline-block;font-weight:900;letter-spacing:1px;font-size:15px;color:#fff;text-decoration:none;opacity:.9}
.dl-hero{max-width:640px;margin:44px auto 8px;text-align:center}
.dl-hero h1{font-size:clamp(30px,7vw,48px);margin:0 0 10px;font-weight:900;text-wrap:balance;background:linear-gradient(100deg,#fff,#c9b3ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.dl-sub{color:var(--dim);font-size:15.5px;line-height:1.55;margin:0 auto 22px;max-width:52ch}
.dl-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 22px;border-radius:14px;font-weight:800;font-size:15px;text-decoration:none;color:#fff;background:rgba(255,255,255,.06);border:1px solid var(--edge)}
.dl-cta-primary{background:linear-gradient(100deg,#9945ff,#7a2bff);border-color:transparent;box-shadow:0 12px 34px -12px rgba(153,69,255,.8)}
.dl-card,.dl-verify{max-width:560px;margin:22px auto 0;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0));border:1px solid var(--edge);border-radius:18px;padding:22px}
.dl-card-head{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
.dl-card-tag{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--cy)}
.dl-card h2,.dl-verify h2{margin:0;font-size:20px;font-weight:800}
.dl-card p,.dl-verify p{color:var(--dim);font-size:14px;line-height:1.6;margin:10px 0}
.dl-steps{color:var(--dim);font-size:14px;line-height:1.7;padding-left:20px;margin:8px 0}
.dl-steps b,.dl-card p b,.dl-verify b{color:var(--ink)}
.dl-note{font-size:12.5px;color:var(--dim);opacity:.85}
.dl-row{margin-top:12px}
.dl-card .dl-cta-primary{width:100%;margin-top:4px}
.dl-stores{max-width:560px;margin:20px auto 0;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.dl-badge{font-size:12px;font-weight:700;padding:7px 12px;border-radius:999px;border:1px solid var(--edge);color:var(--dim)}
.dl-verify{margin-top:28px}
.dl-warn{color:#ffd24a !important;background:rgba(255,170,40,.08);border:1px solid rgba(255,170,40,.3);border-radius:10px;padding:10px 12px;font-size:13px !important}
.dl-sources{color:var(--dim);font-size:13.5px;line-height:1.8;padding-left:20px;margin:6px 0 14px}
.dl-fp{display:flex;flex-direction:column;gap:8px;margin:8px 0}
.dl-fp>div{display:flex;flex-direction:column;gap:3px}
.dl-fp span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cy)}
.dl-fp code,.dl-note code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#cbe9ff;background:rgba(53,224,255,.08);border:1px solid rgba(53,224,255,.18);border-radius:6px;padding:5px 8px;word-break:break-all;line-height:1.5}
`;
