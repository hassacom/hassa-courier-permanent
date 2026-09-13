import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.RESEND_API_KEY)("configured Resend credential", () => {
  it("authenticates against the domains endpoint", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status, await response.text()).toBe(200);
  }, 15_000);
});
