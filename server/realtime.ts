import type { Express } from "express";
import { sdk } from "./_core/sdk";

const HEARTBEAT_MS = 4000;
const MAX_CONNECTION_MS = 45000;

/**
 * Vercel functions are not a reliable place for an in-memory WebSocket hub.
 * This short-lived SSE stream keeps every signed-in workspace fresh without
 * requiring a page refresh, and the browser reconnects automatically.
 */
export function registerRealtimeRoute(app: Express) {
  app.get("/api/realtime", async (req, res) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "يجب تسجيل الدخول لتفعيل التحديثات الفورية." });
    }

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const close = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
      if (!res.writableEnded) res.end();
    };

    const send = (event: string, payload: Record<string, unknown>) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    send("ready", { role: user.role, serverTime: Date.now() });
    heartbeat = setInterval(() => send("refresh", { serverTime: Date.now() }), HEARTBEAT_MS);
    timeout = setTimeout(close, MAX_CONNECTION_MS);
    req.on("close", close);

    return undefined;
  });
}
