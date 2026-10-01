// Purchasable site themes.
//
// A theme is the one cosmetic on the site that the buyer sees constantly — the
// trails, frames and board skins in the shop have no renderer, so owning one is
// currently invisible. A theme retints the whole portal through the existing
// CSS custom properties, so it needs no per-component work.

export interface SiteTheme {
  /** Shop item id, and the inventory item_id granted on purchase. */
  id: string;
  /** Value of the data-theme attribute on <html>. */
  attr: string;
  name: string;
  blurb: string;
  /** Three swatches for the shop card, darkest first. */
  swatch: [string, string, string];
}

export const SITE_THEMES: SiteTheme[] = [
  {
    id: "theme-neon-grid",
    attr: "neon-grid",
    name: "Neon Grid",
    blurb: "Plum-black CRT with a magenta/cyan split, scanlines and a horizon grid.",
    swatch: ["#120a16", "#ff2e88", "#22e3ff"],
  },
];

export const DEFAULT_THEME_LABEL = "Portal (default)";
/** Remembers the viewer's pick. Ownership is still checked server-side on load. */
export const THEME_STORAGE_KEY = "gpx:theme:v1";

export function themeForId(id: string | null | undefined): SiteTheme | undefined {
  return SITE_THEMES.find((t) => t.id === id);
}

export function themeForAttr(attr: string | null | undefined): SiteTheme | undefined {
  return SITE_THEMES.find((t) => t.attr === attr);
}
