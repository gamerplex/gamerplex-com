// Shared liquid-glass design tokens + CSS. One source of truth so the home,
// profile, leaderboard, and docs all render the same frosted shell + Solana
// field (purple/green, pink as a content accent only).

import type React from "react";

export const PURPLE = "#9945ff";
export const GREEN = "#14f195";
export const PINK = "#f553bf";
export const CYAN = "#35e0ff";

// Reusable inline-style objects for pages/components that style with inline
// styles (e.g. ProfileView). Same frosted look as the `.glass` class.
export const glassPanel: React.CSSProperties = {
  background: "linear-gradient(150deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
  backdropFilter: "blur(26px) saturate(180%)",
  WebkitBackdropFilter: "blur(26px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "0 12px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(255,255,255,0.06)",
};

// Lighter inset panel for rows/tiles that sit INSIDE a glass panel.
export const glassInset: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
};

export const GLASS_CSS = `
  .gl-root { position:relative; min-height:100vh; background:#07060f; color:#fff; font-family:'Space Grotesk',system-ui,sans-serif; overflow-x:hidden; }
  .gl-bg { position:fixed; inset:0; z-index:0;
    background:
      radial-gradient(85% 55% at 22% -10%, rgba(153,69,255,0.34) 0%, transparent 60%),
      radial-gradient(95% 60% at 78% 112%, rgba(20,241,149,0.20) 0%, transparent 64%),
      #08070f; }
  .gl-wrap { position:relative; z-index:1; max-width:1120px; margin:0 auto; padding:18px 16px 60px; }

  .glass { background:linear-gradient(150deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05));
    backdrop-filter:blur(26px) saturate(180%); -webkit-backdrop-filter:blur(26px) saturate(180%);
    border:1px solid rgba(255,255,255,0.18);
    box-shadow:0 12px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(255,255,255,0.06); }

  .gl-top { position:relative; z-index:100; display:flex; align-items:center; justify-content:space-between; padding:10px 12px 10px 16px; border-radius:20px; margin-bottom:26px; }
  .gl-brand { display:flex; align-items:center; gap:10px; }
  .gl-logo { font-weight:900; font-style:italic; font-size:17px; letter-spacing:-0.5px; background:linear-gradient(135deg,#9945FF,#14F195); -webkit-background-clip:text; background-clip:text; color:transparent; text-decoration:none; }
  .gl-mn { font-size:10px; font-weight:800; letter-spacing:1px; color:#04120b; background:${GREEN}; padding:4px 10px; border-radius:999px; }
  .gl-signin { background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.26); color:#fff; font-weight:800; font-size:13px; padding:8px 16px; border-radius:999px; cursor:pointer; backdrop-filter:blur(10px); font-family:inherit; }
  .gl-signin:hover { background:rgba(255,255,255,0.22); }
  .gl-user { display:inline-flex; align-items:center; gap:6px; text-decoration:none; color:#fff; font-weight:800; font-size:13px; padding:7px 14px; border-radius:999px; max-width:160px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; background:rgba(20,241,149,0.14); border:1px solid rgba(20,241,149,0.42); }

  .gl-hero-grid { display:grid; grid-template-columns:1fr; gap:16px; margin-bottom:34px; }
  .gl-h1 { font-size:clamp(52px,15vw,104px); font-weight:900; letter-spacing:-3px; line-height:0.86; margin:4px 0 8px;
    background:linear-gradient(120deg,#c9a6ff,#9945FF,#14F195); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .gl-tag { font-size:14px; font-weight:800; letter-spacing:3px; color:rgba(255,255,255,0.72); margin:0 0 20px; text-transform:uppercase; }
  .gl-cta-hero { max-width:420px; }
  .gl-ticker { display:inline-block; margin-top:16px; padding:9px 16px; border-radius:999px; font-size:12.5px; color:rgba(255,255,255,0.85); }
  .gl-ticker b { color:${GREEN}; }
  .gl-live { color:${GREEN}; font-weight:800; }

  .gl-signin-card { border-radius:24px; padding:22px; }
  .gl-sc-title { font-size:20px; font-weight:900; letter-spacing:-0.5px; }
  .gl-sc-sub { font-size:13px; color:rgba(255,255,255,0.78); margin-top:6px; line-height:1.5; }
  .gl-sc-sub b { color:${GREEN}; }
  .gl-sc-note { font-size:11px; color:rgba(255,255,255,0.5); margin-top:10px; }
  .gl-sc-link { display:inline-block; margin-top:12px; color:${PURPLE}; font-weight:800; font-size:13px; text-decoration:none; }

  .gl-h2 { font-size:22px; font-weight:900; letter-spacing:-0.5px; margin:6px 0 14px; }
  .gl-h2-sub { font-size:13px; font-weight:600; color:rgba(255,255,255,0.55); }

  .gl-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin-bottom:34px; }
  .gl-card { position:relative; overflow:hidden; border-radius:24px; min-height:220px; text-decoration:none; color:#fff; display:flex; flex-direction:column; border:1px solid rgba(255,255,255,0.14); box-shadow:0 12px 40px rgba(0,0,0,0.36); transition:transform .16s ease, box-shadow .16s ease; }
  .gl-card:hover { transform:translateY(-4px); box-shadow:0 24px 64px rgba(0,0,0,0.5); }
  .gl-card-img { position:absolute; inset:0; background-size:cover; background-position:center; }
  .gl-card-img::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 30%, rgba(7,6,15,0.30) 58%, rgba(7,6,15,0.74) 80%, rgba(7,6,15,0.93) 100%); }
  .gl-arrow { position:absolute; top:12px; right:12px; z-index:2; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px; background:rgba(10,10,18,0.35); border:1px solid rgba(255,255,255,0.3); backdrop-filter:blur(8px); color:#fff; }
  .gl-card-plays { position:absolute; top:12px; left:12px; z-index:2; display:inline-flex; align-items:center; gap:4px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:800; color:#fff; background:rgba(10,10,18,0.5); border:1px solid rgba(255,120,60,0.5); backdrop-filter:blur(8px); text-shadow:0 1px 4px rgba(0,0,0,0.6); white-space:nowrap; }
  .gl-card-info { position:relative; margin-top:auto; padding:13px 15px 14px; border:none; background:none; box-shadow:none; backdrop-filter:none; }
  .gl-card-name { font-size:19px; font-weight:800; letter-spacing:-0.4px; text-shadow:0 1px 10px rgba(0,0,0,0.55); }
  .gl-card-sub { display:block; font-size:10.5px; font-weight:600; letter-spacing:0.2px; color:rgba(255,255,255,0.62); text-shadow:0 1px 8px rgba(0,0,0,0.6); margin-top:1px; }
  .gl-card-row { display:flex; align-items:flex-end; justify-content:space-between; gap:8px; margin-top:3px; }
  .gl-card-tag { font-size:11.5px; line-height:1.42; color:rgba(255,255,255,0.88); flex:1; text-shadow:0 1px 8px rgba(0,0,0,0.6);
    min-height:2.84em; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .gl-play { font-size:11px; font-weight:900; color:var(--accent); white-space:nowrap; text-shadow:0 1px 8px rgba(0,0,0,0.7); }

  .gl-lb { border-radius:24px; padding:18px; margin-bottom:34px; }

  .gl-game { display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap; border-radius:24px; padding:22px 24px; }
  .gl-game-k { font-size:11px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:${PINK}; }
  .gl-game-t { font-size:22px; font-weight:900; letter-spacing:-0.5px; margin:4px 0 6px; }
  .gl-game-s { font-size:13px; color:rgba(255,255,255,0.78); line-height:1.55; max-width:640px; }
  .gl-game-btn { flex-shrink:0; text-decoration:none; font-weight:900; font-size:14px; color:#04120b; padding:12px 22px; border-radius:999px; background:linear-gradient(100deg,${PURPLE},${GREEN}); box-shadow:0 10px 30px rgba(20,241,149,0.22); }

  .gl-cta { position:relative; width:100%; border:none; cursor:pointer; font-family:inherit; display:flex; align-items:center; justify-content:space-between; gap:12px;
    border-radius:999px; padding:8px 8px 8px 26px; text-decoration:none; font-size:18px; font-weight:900; color:#04120b;
    background:linear-gradient(100deg,${PURPLE},${GREEN}); box-shadow:0 16px 50px rgba(20,241,149,0.26), inset 0 1px 0 rgba(255,255,255,0.55); }
  .gl-cta-arrow { width:48px; height:48px; flex-shrink:0; border-radius:50%; background:#0a0a12; color:${GREEN}; display:flex; align-items:center; justify-content:center; font-size:21px; }
  .gl-foot { text-align:center; font-size:12px; color:rgba(255,255,255,0.5); margin-top:18px; }

  @media (min-width:820px){
    .gl-hero-grid { grid-template-columns:1.35fr 1fr; align-items:center; gap:28px; }
    .gl-grid { grid-template-columns:repeat(4,1fr); gap:16px; }
    .gl-card { min-height:260px; }
  }
`;
