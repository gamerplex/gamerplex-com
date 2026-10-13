import { NextResponse } from "next/server";
import { ASSETS, files } from "../../assets/_data/assets";

export const dynamic = "force-static";

export function GET() {
  const base = "https://gamerplex.com";
  return NextResponse.json({
    licence: "CC0-1.0",
    assets: ASSETS.map((a) => ({
      ...a,
      page: `${base}/assets/${a.slug}`,
      glb: `${base}${files(a.slug).glb}`,
      thumbnail: `${base}${files(a.slug).thumb}`,
      provenance: `${base}${files(a.slug).provenance}`,
    })),
  });
}
