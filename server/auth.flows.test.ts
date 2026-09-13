import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createEmailUser: vi.fn(),
  getUserByEmail: vi.fn(),
  setEmailVerificationToken: vi.fn(),
  verifyEmailUser: vi.fn(),
}));
const emailMocks = vi.hoisted(() => ({
  buildVerificationEmail: vi.fn(() => ({ subject: "verify", html: "<p>verify</p>" })),
  sendEmail: vi.fn(),
}));
const sdkMocks = vi.hoisted(() => ({
  createSessionToken: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./email", () => emailMocks);
vi.mock("./_core/sdk", () => ({ sdk: sdkMocks }));

import { appRouter } from "./routers";
import { hashPassword } from "./auth";
import { ONE_YEAR_MS } from "../shared/const";

const request = { headers: {}, protocol: "https", get: () => "hassa.test" };
const response = { cookie: vi.fn(), clearCookie: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAIL;
  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.RESEND_FROM_EMAIL = "Hassa <noreply@example.com>";
  process.env.REQUIRE_EMAIL_VERIFICATION = "true";
  emailMocks.sendEmail.mockResolvedValue({ sent: true, id: "email-1" });
  sdkMocks.createSessionToken.mockResolvedValue("session-token");
});

afterEach(() => {
  delete process.env.ADMIN_EMAIL;
});

describe("email authentication flows", () => {
  it("rejects an unauthorized admin registration email", async () => {
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    await expect(caller.auth.register({ name: "Admin", email: "other@example.com", password: "password123", role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.createEmailUser).not.toHaveBeenCalled();
  });

  it("accepts the configured admin email regardless of stored email casing", async () => {
    process.env.ADMIN_EMAIL = "owner@example.com";
    dbMocks.getUserByEmail.mockResolvedValue({ openId: "admin-1", name: "Owner", email: "OWNER@EXAMPLE.COM", role: "admin", emailVerifiedAt: new Date(), passwordHash: await hashPassword("password123") });
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    const result = await caller.auth.login({ email: "owner@example.com", password: "password123", role: "admin" });
    expect(result).toMatchObject({ success: true, role: "admin", email: "OWNER@EXAMPLE.COM" });
    expect(response.cookie).toHaveBeenCalledWith(expect.any(String), "session-token", expect.objectContaining({ maxAge: ONE_YEAR_MS }));
  });

  it("registers a customer and dispatches a verification email", async () => {
    dbMocks.createEmailUser.mockResolvedValue({ email: "customer@example.com", name: "Customer", openId: "email-customer" });
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    const result = await caller.auth.register({ name: "Customer", email: "Customer@example.com", password: "password123", role: "customer" });
    expect(result.requiresVerification).toBe(true);
    expect(dbMocks.createEmailUser).toHaveBeenCalledWith(expect.objectContaining({ email: "customer@example.com", role: "user", passwordHash: expect.stringContaining("scrypt$") }));
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "customer@example.com" }));
  });

  it("allows customer registration and login immediately when verification is deferred", async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    dbMocks.createEmailUser.mockResolvedValue({ email: "customer@example.com", name: "Customer", openId: "email-customer", role: "user" });
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    const result = await caller.auth.register({ name: "Customer", email: "Customer@example.com", password: "password123", role: "customer" });
    expect(result.requiresVerification).toBe(false);
    expect(result.verificationDeferred).toBe(true);
    expect(response.cookie).toHaveBeenCalled();
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("blocks login until the email is verified", async () => {
    dbMocks.getUserByEmail.mockResolvedValue({ email: "customer@example.com", role: "user", emailVerifiedAt: null, passwordHash: "scrypt$bad" });
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    await expect(caller.auth.login({ email: "customer@example.com", password: "password123", role: "customer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("verifies the token and creates a session", async () => {
    dbMocks.verifyEmailUser.mockResolvedValue({ email: "customer@example.com", name: "Customer", openId: "email-customer", role: "user" });
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    const result = await caller.auth.verify({ email: "customer@example.com", token: "a".repeat(32) });
    expect(result.success).toBe(true);
    expect(sdkMocks.createSessionToken).toHaveBeenCalledWith("email-customer", expect.any(Object));
    expect(response.cookie).toHaveBeenCalled();
  });

  it("keeps deferred access while allowing a later verification request", async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    dbMocks.createEmailUser.mockResolvedValue({ email: "later@example.com", name: "Later", openId: "email-later", role: "user", emailVerifiedAt: null });
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    const created = await caller.auth.register({ name: "Later", email: "later@example.com", password: "password123", role: "customer" });
    expect(created.requiresVerification).toBe(false);
    dbMocks.getUserByEmail.mockResolvedValue({ email: "later@example.com", name: "Later", role: "user", emailVerifiedAt: null, passwordHash: await hashPassword("password123") });
    const login = await caller.auth.login({ email: "later@example.com", password: "password123", role: "customer" });
    expect(login.success).toBe(true);
    dbMocks.setEmailVerificationToken.mockResolvedValue({ email: "later@example.com" });
    const requested = await caller.auth.resendVerification({ email: "later@example.com" });
    expect(requested.accepted).toBe(true);
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "later@example.com" }));
  });

  it("returns a safe account summary with verification status", async () => {
    const caller = appRouter.createCaller({ user: { openId: "email-customer", name: "Customer", email: "customer@example.com", role: "user", emailVerifiedAt: null, passwordHash: "secret", emailVerificationTokenHash: "token" } as never, req: request as never, res: response as never });
    await expect(caller.auth.me()).resolves.toEqual({ openId: "email-customer", name: "Customer", email: "customer@example.com", role: "user", isEmailVerified: false });
  });

  it("resends verification mail for an unverified account", async () => {
    dbMocks.getUserByEmail.mockResolvedValue({ email: "customer@example.com", name: "Customer", emailVerifiedAt: null });
    dbMocks.setEmailVerificationToken.mockResolvedValue({ email: "customer@example.com" });
    const caller = appRouter.createCaller({ user: null, req: request as never, res: response as never });
    const result = await caller.auth.resendVerification({ email: "customer@example.com" });
    expect(result.accepted).toBe(true);
    expect(dbMocks.setEmailVerificationToken).toHaveBeenCalled();
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "customer@example.com" }));
  });
});
