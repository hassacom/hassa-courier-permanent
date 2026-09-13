import type { Request, Response } from "express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import type { SsrPrefetch } from "../../client/src/ssr/prefetch";

const CATALOG_CACHE_TTL_MS = 15_000;
let catalogCache: { value: unknown; expiresAt: number } | null = null;
let catalogRequest: Promise<unknown> | null = null;

async function getCachedCatalog(caller: ReturnType<typeof appRouter.createCaller>) {
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) return catalogCache.value;
  if (!catalogRequest) {
    catalogRequest = caller.catalog.list()
      .then((value) => {
        catalogCache = { value, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
        return value;
      })
      .finally(() => { catalogRequest = null; });
  }
  return catalogRequest;
}

export async function buildSsrPrefetch(req: Request, res: Response): Promise<SsrPrefetch> {
  const ctx = await createContext({ req, res } as any);
  const caller = appRouter.createCaller(ctx);
  return {
    catalogList: () => getCachedCatalog(caller),
    productById: (productId) => caller.catalog.get({ productId }),
  };
}
