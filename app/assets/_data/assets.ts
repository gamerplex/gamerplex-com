import catalog from "./catalog.json";

export type Asset = {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  description: string;
  method: string;
  generator: string;
  licence: string;
  glb_bytes: number;
  preview_bytes?: number;
  concept: boolean;
  tris?: number;
  rigged?: boolean;
  size_m?: number[];
};

export const ASSETS = catalog as Asset[];
export const CATEGORIES = Array.from(new Set(ASSETS.map((a) => a.category)));

export function asset(slug: string): Asset | undefined {
  return ASSETS.find((a) => a.slug === slug);
}

export const files = (slug: string) => ({
  preview: `/assets/${slug}/preview.glb`,
  download: `/api/assets/${slug}/download`,
  thumb: `/assets/${slug}/thumb.webp`,
  concept: `/assets/${slug}/concept.webp`,
  provenance: `/assets/${slug}/provenance.json`,
});

export const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;
