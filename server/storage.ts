import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ENV } from "./_core/env";

const LOCAL_STORAGE_PREFIX = "local/";

function getForgeConfig() {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error("Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  }
  return { forgeUrl: ENV.forgeApiUrl.replace(/\/+$/, ""), forgeKey: ENV.forgeApiKey };
}

function normalizeKey(relKey: string) {
  const key = relKey.replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\")) throw new Error("Invalid storage path");
  return key;
}

function appendHashSuffix(relKey: string) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const lastDot = relKey.lastIndexOf(".");
  return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function localStorageRoot() {
  return path.resolve(process.env.HASSA_UPLOAD_DIR?.trim() || path.join(process.cwd(), "data", "uploads"));
}

function localFilePath(storageKey: string) {
  if (!isLocalStorageKey(storageKey)) throw new Error("Not a local storage key");
  const relativeKey = normalizeKey(storageKey.slice(LOCAL_STORAGE_PREFIX.length));
  const root = localStorageRoot();
  const filePath = path.resolve(root, relativeKey);
  const relativeToRoot = path.relative(root, filePath);
  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) throw new Error("Invalid storage path");
  return filePath;
}

function contentTypeForKey(storageKey: string) {
  const extension = path.extname(storageKey).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
  };
  return types[extension] || "application/octet-stream";
}

export function isLocalStorageKey(storageKey: string) {
  return storageKey.startsWith(LOCAL_STORAGE_PREFIX);
}

async function putInForge(key: string, data: Buffer | Uint8Array, contentType: string) {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const presignUrl = new URL("v1/storage/presign/put", `${forgeUrl}/`);
  presignUrl.searchParams.set("path", key);
  const presignResponse = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResponse.ok) throw new Error(`Storage presign failed (${presignResponse.status})`);
  const { url } = (await presignResponse.json()) as { url?: string };
  if (!url) throw new Error("Forge returned empty presign URL");
  const uploadResponse = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: new Blob([data as any], { type: contentType }) });
  if (!uploadResponse.ok) throw new Error(`Storage upload failed (${uploadResponse.status})`);
  return { key, url: `/api/storage/${encodeURIComponent(key)}` };
}

async function putLocally(key: string, data: Buffer | Uint8Array) {
  const storageKey = `${LOCAL_STORAGE_PREFIX}${key}`;
  const filePath = localFilePath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return { key: storageKey, url: `/api/storage/${encodeURIComponent(storageKey)}` };
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array, contentType: string) {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    try {
      return await putInForge(key, data, contentType);
    } catch (error) {
      console.warn("[Storage] Remote storage failed.", error);
      if (process.env.VERCEL) throw new Error("Remote storage is unavailable; refusing to save a temporary image on Vercel.");
    }
  }
  if (process.env.VERCEL) throw new Error("Remote storage is required for product images on Vercel.");
  return putLocally(key, data);
}

export async function storageReadLocal(storageKey: string) {
  try {
    const data = await readFile(localFilePath(storageKey));
    return { data, contentType: contentTypeForKey(storageKey) };
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function storageGetSignedUrl(relKey: string) {
  if (isLocalStorageKey(relKey)) throw new Error("Local storage files are served by the application");
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", `${forgeUrl}/`);
  getUrl.searchParams.set("path", key);
  const response = await fetch(getUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!response.ok) throw new Error(`Storage signed URL failed (${response.status})`);
  const { url } = (await response.json()) as { url?: string };
  if (!url) throw new Error("Forge returned empty signed URL");
  return url;
}
