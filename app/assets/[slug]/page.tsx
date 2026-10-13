import type { Metadata } from "next";
import { notFound } from "next/navigation";

import AssetDetail from "./AssetDetail";
import { ASSETS, asset, files } from "../_data/assets";

export const dynamicParams = false;

export function generateStaticParams() {
  return ASSETS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = asset((await params).slug);
  if (!a) return {};
  const title = `${a.title}: free CC0 3D model (GLB)`;
  const url = `https://gamerplex.com/assets/${a.slug}`;
  return {
    title,
    description: `${a.description} Free CC0 download, with a provenance record of how it was made.`,
    alternates: { canonical: url },
    openGraph: { title, description: a.description, url, siteName: "Gamerplex", type: "website", images: [{ url: files(a.slug).thumb, width: 640, height: 640, alt: a.title }] },
    twitter: { card: "summary_large_image", site: "@gamerplex_com", title, description: a.description, images: [files(a.slug).thumb] },
  };
}

export default async function AssetPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = asset((await params).slug);
  if (!a) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "3DModel",
    name: a.title,
    description: a.description,
    url: `https://gamerplex.com/assets/${a.slug}`,
    image: `https://gamerplex.com${files(a.slug).thumb}`,
    encoding: { "@type": "MediaObject", contentUrl: `https://gamerplex.com${files(a.slug).glb}`, encodingFormat: "model/gltf-binary" },
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Gamerplex", url: "https://gamerplex.com" },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <AssetDetail a={a} />
    </>
  );
}
