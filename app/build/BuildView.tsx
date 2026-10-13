"use client";

import Link from "next/link";
import GlassShell from "../../components/GlassShell";
import { glassPanel } from "../../components/glass";

const REPO = "https://github.com/gamerplex/sovereign-world-kit";
const DEV_REPO = "https://github.com/gamerplex/gamerplex-dev";

export default function BuildView() {
  return (
    <GlassShell activeLabel="Docs">
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "8px 4px 64px" }}>
        <p style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: 3, color: "#14F195", textTransform: "uppercase", marginBottom: 10 }}>
          Sovereign World Kit
        </p>
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1, color: "#fff", marginBottom: 14 }}>
          One sentence to your AI. <span style={{ background: "linear-gradient(90deg,#9945FF,#14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One playable world.</span>
        </h1>
        <p style={{ fontSize: 17, color: "#bbb", lineHeight: 1.6, marginBottom: 24 }}>
          Tell Claude, ChatGPT or Codex to build a world <strong style={{ color: "#fff" }}>with Gamerplex</strong>. About a minute later you can walk it in your browser.
          Every part is openly licensed, every world ships with a provenance record, and nobody can take it down.
        </p>

        <div style={{ ...glassPanel, borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
          <img src="/build/world-kit-demo.gif" alt="An AI agent builds a neon night street from the Sovereign World Kit, then walks through it in the browser" style={{ width: "100%", display: "block" }} />
        </div>
        <p style={{ fontFamily: "monospace", fontSize: 13, color: "#14F195", marginBottom: 40 }}>
          &gt; build a neon cyberpunk street with gamerplex
        </p>

        <Step n={1} title="Install the kit in Claude Code">
          <P>Inside Claude Code, run:</P>
          <Code>{`/plugin marketplace add gamerplex/sovereign-world-kit
/plugin install sovereign-world-kit@gamerplex`}</Code>
          <P>You also need <a href="https://www.blender.org/download/" style={link}>Blender</a> (free) and Python 3. The first build downloads the open-licence materials once (about 250 MB).</P>
        </Step>

        <Step n={2} title="Ask for a world">
          <Code>build a neon cyberpunk street with gamerplex</Code>
          <P>Make it yours: &quot;24 bays long&quot;, &quot;a rainy night street&quot;, &quot;a different shop mix&quot;. The agent picks the size, density and seed, builds it and opens a walkable web scene.</P>
        </Step>

        <Step n={3} title="Walk it, share it">
          <P>Click into the scene, then WASD and mouse (on a phone: drag to look, hold to walk). The folder is a complete web game: drop it on any static host, or keep building on top of it.</P>
        </Step>

        <h2 style={h2}>Prefer a chat window with a live preview?</h2>
        <P>
          <a href={DEV_REPO} style={link}>gamerplex-dev</a> is our open-source studio at <code style={inline}>localhost:42069</code>: chat on the left, your game live on the right, with any brain (Claude, OpenAI, Gemini or a fully local model).
        </P>
        <Code>{`git clone ${DEV_REPO} && cd gamerplex-dev
npm install
npm start ./games/my-street`}</Code>
        <P>With the kit available to your agent, type the same sentence and the street appears in the preview (press Restart Game).</P>

        <h2 style={h2}>Or run it yourself</h2>
        <Code>{`git clone ${REPO} && cd sovereign-world-kit
python3 Tools/kit/cc0_fetch.py              # once: open-licence materials
DENSE=1 Tools/kit/street.sh 24 12 --serve   # neon street, 24 bays, seed 12 → http://localhost:8765`}</Code>

        <h2 style={h2}>What you get</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 32 }}>
          <Card title="street.glb" body="The 3D world. Opens in any glTF engine: three.js, Godot, Blender. Unreal builds the same modules natively." />
          <Card title="provenance.json" body="Every part used: where it came from, its licence and a fingerprint (hash) of the file." />
          <Card title="LICENSE" body="CC0 1.0. Use it in anything, commercial included." />
          <Card title="index.html" body="A playable web scene for desktop and phone." />
        </div>

        <h2 style={h2}>The rules the kit keeps</h2>
        <ul style={{ color: "#aaa", fontSize: 14, lineHeight: 1.8, paddingLeft: 20, marginBottom: 32, listStyle: "disc" }}>
          <li>Builds only from open-licence parts and its own generators.</li>
          <li>Refuses to recreate other people&apos;s games, characters, logos or real shop signs.</li>
          <li>Stops the build if any input has no known open-licence source.</li>
        </ul>

        <div style={{ ...glassPanel, borderRadius: 16, padding: "22px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Coming next: publish in one click</p>
            <p style={{ color: "#aaa", fontSize: 14 }}>Host your world, get a challenge link, and sign in with Flipcash to bring your community.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={REPO} style={btnPrimary}>Star on GitHub</a>
            <Link href="/docs#world-kit" style={btn}>Read the docs</Link>
          </div>
        </div>
      </div>
    </GlassShell>
  );
}

const link: React.CSSProperties = { color: "#14F195" };
const inline: React.CSSProperties = { color: "#e0b3ff", fontFamily: "monospace" };
const h2: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: "#fff", margin: "36px 0 12px" };
const btn: React.CSSProperties = { padding: "10px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontWeight: 600, fontSize: 14, textDecoration: "none" };
const btnPrimary: React.CSSProperties = { ...btn, background: "linear-gradient(90deg,#9945FF,#14F195)", border: "none", color: "#0b0620" };

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", gap: 16, marginBottom: 28 }}>
      <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 999, background: "linear-gradient(135deg,#9945FF,#14F195)", color: "#0b0620", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{title}</h3>
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: "#aaa", lineHeight: 1.75, marginBottom: 12 }}>{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "14px 18px", fontSize: 13, color: "#e0b3ff", fontFamily: "monospace", overflowX: "auto", marginBottom: 12, lineHeight: 1.6 }}>
      <code>{children}</code>
    </pre>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ ...glassPanel, borderRadius: 12, padding: "16px 18px" }}>
      <p style={{ fontFamily: "monospace", color: "#14F195", fontSize: 14, marginBottom: 6 }}>{title}</p>
      <p style={{ color: "#aaa", fontSize: 13, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}
