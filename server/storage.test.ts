import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { isLocalStorageKey, storagePut, storageReadLocal } from "./storage";

const originalForgeUrl = ENV.forgeApiUrl;
const originalForgeKey = ENV.forgeApiKey;
let uploadDir = "";

beforeEach(async () => {
  ENV.forgeApiUrl = "";
  ENV.forgeApiKey = "";
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "hassa-upload-test-"));
  process.env.HASSA_UPLOAD_DIR = uploadDir;
});

afterEach(async () => {
  ENV.forgeApiUrl = originalForgeUrl;
  ENV.forgeApiKey = originalForgeKey;
  delete process.env.HASSA_UPLOAD_DIR;
  delete process.env.VERCEL;
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

describe("local product image storage", () => {
  it("writes an uploaded image and serves it back with its content type", async () => {
    const source = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const result = await storagePut("hassa/stores/store-1/products/photo.png", source, "image/png");

    expect(isLocalStorageKey(result.key)).toBe(true);
    expect(result.url).toBe(`/api/storage/${encodeURIComponent(result.key)}`);

    const stored = await storageReadLocal(result.key);
    expect(stored?.contentType).toBe("image/png");
    expect(stored?.data.equals(source)).toBe(true);
  });

  it("does not allow traversal outside the upload directory", async () => {
    await expect(storagePut("../outside.png", Buffer.from("no"), "image/png")).rejects.toThrow("Invalid storage path");
  });

  it("does not fall back to ephemeral local storage on Vercel", async () => {
    process.env.VERCEL = "1";
    await expect(storagePut("hassa/stores/store-1/products/photo.png", Buffer.from("no"), "image/png")).rejects.toThrow("Remote storage is required");
  });
});
