import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerEmailAuthRoutes } from "./emailAuthRoutes";
import { registerSeoRoutes } from "./seo";
import { registerRealtimeRoute } from "./realtime";
import { isLocalStorageKey, storageGetSignedUrl, storageReadLocal } from "./storage";
import { BUILD_VERSION } from "./buildVersion";

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.json({ service: "hassa-staging", api: "support.get-sanitized", version: BUILD_VERSION });
  });
  registerEmailAuthRoutes(app);
  registerSeoRoutes(app);
  registerRealtimeRoute(app);
  app.get(/^\/api\/storage\/(.+)$/, async (req, res) => {
    try {
      const key = decodeURIComponent(String(req.params[0] || ""));
      if (isLocalStorageKey(key)) {
        const stored = await storageReadLocal(key);
        if (!stored) return res.status(404).json({ error: "Image not found" });
        res.setHeader("Content-Type", stored.contentType);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.send(stored.data);
      }
      const signedUrl = await storageGetSignedUrl(key);
      return res.redirect(307, signedUrl);
    } catch {
      return res.status(404).json({ error: "Image not found" });
    }
  });
  app.use("/api/trpc", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}
