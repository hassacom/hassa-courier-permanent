import type { Express, Request, Response } from "express";
import { ONE_YEAR_MS, COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { hashToken } from "./auth";
import { verifyEmailUser } from "./db";

function queryString(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : "";
}

export function registerEmailAuthRoutes(app: Express) {
  app.get("/api/auth/verify", async (req: Request, res: Response) => {
    const email = queryString(req, "email");
    const token = queryString(req, "token");
    if (!email || !token) {
      res.status(400).send("رابط التأكيد ناقص.");
      return;
    }

    try {
      const user = await verifyEmailUser(email, hashToken(token));
      if (!user) {
        res.status(400).send("رابط التأكيد غير صالح أو منتهي. اطلب رسالة جديدة من صفحة الدخول.");
        return;
      }
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "هسّا", expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      const destination = user.role === "admin" ? "/admin" : user.role === "store" ? "/store" : "/customer";
      res.redirect(302, `${destination}?verified=1`);
    } catch (error) {
      console.error("[EmailAuth] Verification failed", error);
      res.status(500).send("تعذر تأكيد البريد الآن. حاول مرة أخرى.");
    }
  });
}
