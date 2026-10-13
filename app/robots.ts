import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/profile", "/verify-email-error"] },
      { userAgent: ["GPTBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "CCBot"], allow: "/" },
    ],
    sitemap: "https://gamerplex.com/sitemap.xml",
    host: "https://gamerplex.com",
  };
}
