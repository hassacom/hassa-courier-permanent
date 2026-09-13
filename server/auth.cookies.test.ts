import { afterEach, describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";

const request = (protocol: string, headers: Record<string, string> = {}) =>
  ({ protocol, headers }) as never;

afterEach(() => {
  delete process.env.NODE_ENV;
});

describe("session cookie options", () => {
  it("uses a versioned Hassa session cookie to isolate legacy browser cookies", () => {
    expect(COOKIE_NAME).toBe("hassa_session_v2");
  });
  it("forces secure cookies in production behind a proxy", () => {
    process.env.NODE_ENV = "production";
    expect(getSessionCookieOptions(request("http"))).toMatchObject({
      secure: true,
      sameSite: "none",
    });
  });

  it("uses lax cookies for local HTTP development", () => {
    process.env.NODE_ENV = "development";
    expect(getSessionCookieOptions(request("http"))).toMatchObject({
      secure: false,
      sameSite: "lax",
    });
  });
});
