"use client";

// Shared top-nav used on inline-styled pages (arcade, leaderboard, activity,
// docs). Desktop: flex-row of links (matches existing look). Mobile (<700px):
// collapses into a ☰ hamburger that expands a vertical drawer.
//
// Uses uncontrolled React state — no context or store needed.

import Link from "next/link";
import { useState } from "react";

export interface NavLink {
  href: string;
  label: string;
  /** Highlighted "current page" look. */
  active?: boolean;
  /** Open in a new tab (e.g. external). */
  external?: boolean;
}

interface Props {
  links: NavLink[];
  /** Optional right-aligned slot (e.g. wallet connect button). */
  right?: React.ReactNode;
}

export function SiteNav({ links, right }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop row — hidden on mobile via CSS. */}
      <nav className="site-nav-desktop" style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 13 }}>
        {links.map((l) => (
          <LinkItem key={l.href} link={l} />
        ))}
        {right}
      </nav>

      {/* Mobile trigger — shown only on narrow screens. */}
      <button
        type="button"
        className="site-nav-hamburger"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hb-bar" />
        <span className="hb-bar" />
        <span className="hb-bar" />
      </button>

      {/* Mobile drawer — conditionally rendered. */}
      {open && (
        <div
          className="site-nav-drawer"
          role="menu"
          onClick={(e) => {
            // Close when tapping a link (delegated).
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {links.map((l) => (
            <LinkItem key={l.href} link={l} block />
          ))}
          {right && <div className="site-nav-drawer-right">{right}</div>}
        </div>
      )}

      <style>{`
        .site-nav-hamburger {
          display: none;
          flex-direction: column;
          gap: 5px;
          width: 40px;
          height: 40px;
          padding: 10px 9px;
          background: #0c0c14;
          border: 1px solid #252540;
          border-radius: 8px;
          cursor: pointer;
          align-items: center;
          justify-content: center;
        }
        .site-nav-hamburger .hb-bar {
          display: block;
          width: 20px;
          height: 2px;
          background: #e8e8f0;
          border-radius: 1px;
        }
        .site-nav-drawer {
          display: flex;
          flex-direction: column;
          gap: 2px;
          position: absolute;
          top: 60px;
          right: 12px;
          min-width: 170px;
          padding: 8px;
          background: #0c0c14;
          border: 1px solid #252540;
          border-radius: 10px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
          z-index: 200;
        }
        .site-nav-drawer a {
          display: block;
          padding: 10px 14px;
          border-radius: 6px;
          font-size: 13px;
          text-decoration: none;
        }
        .site-nav-drawer a:hover {
          background: #14141f;
        }
        .site-nav-drawer-right {
          padding: 8px 4px 4px;
          border-top: 1px solid #252540;
          margin-top: 6px;
        }

        /* Desktop ≥ 700px: show row, hide hamburger + drawer. */
        @media (min-width: 701px) {
          .site-nav-hamburger,
          .site-nav-drawer {
            display: none !important;
          }
        }
        /* Mobile < 700px: hide row, show hamburger. */
        @media (max-width: 700px) {
          .site-nav-desktop {
            display: none !important;
          }
          .site-nav-hamburger {
            display: flex;
          }
        }
      `}</style>
    </>
  );
}

function LinkItem({ link, block }: { link: NavLink; block?: boolean }) {
  const baseStyle: React.CSSProperties = {
    color: link.active ? "#c99aff" : "#8a8aa0",
    textDecoration: "none",
    fontWeight: link.active ? 700 : 400,
    ...(block ? { display: "block" } : {}),
  };
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" style={baseStyle}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} style={baseStyle}>
      {link.label}
    </Link>
  );
}
