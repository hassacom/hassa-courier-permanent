import type { Express } from "express";
import { listCatalog } from "./db";

const FALLBACK_ORIGIN = "https://hassa-lime.vercel.app";

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function originFromEnv() {
  return (process.env.CANONICAL_ORIGIN || FALLBACK_ORIGIN).replace(/\/$/, "");
}

export function registerSeoRoutes(app: Express) {
  app.get("/robots.txt", (_req, res) => {
    const origin = originFromEnv();
    res.status(200).type("text/plain").send([
      "User-agent: *",
      "Allow: /",
      "Disallow: /login",
      "Disallow: /customer",
      "Disallow: /store",
      "Disallow: /merchant",
      "Disallow: /admin",
      "Disallow: /staff",
      "Disallow: /support",
      "Disallow: /invite",
      "Disallow: /api/",
      "Disallow: /*?*",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n"));
  });

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const origin = originFromEnv();
      const catalog = await listCatalog();
      const staticPaths = ["/", "/shop", "/for-merchants"];
      const urls = [...staticPaths, ...catalog.products.map((product) => `/product/${product.id}`)];
      const body = urls.map((path) => `<url><loc>${xmlEscape(`${origin}${path}`)}</loc><changefreq>${path.startsWith("/product/") ? "weekly" : "daily"}</changefreq></url>`).join("");
      res.status(200).type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
    } catch (error) {
      console.error("[SEO] Failed to build sitemap", error);
      res.status(503).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>");
    }
  });
}
