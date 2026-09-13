import { afterEach, describe, expect, it, vi } from "vitest";
import { buildVerificationEmail, sendEmail } from "./email";

const nodemailerMock = vi.hoisted(() => ({
  createTransport: vi.fn(),
}));
vi.mock("nodemailer", () => ({ default: nodemailerMock }));

const emailEnvKeys = [
  "GMAIL_SMTP_USER",
  "GMAIL_SMTP_APP_PASSWORD",
  "GMAIL_SMTP_PASSWORD",
  "GMAIL_SMTP_FROM_EMAIL",
  "GMAIL_SMTP_HOST",
  "GMAIL_SMTP_PORT",
  "GMAIL_SMTP_SECURE",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;
const originalEnv = Object.fromEntries(emailEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of emailEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  nodemailerMock.createTransport.mockReset();
});

describe("email verification", () => {
  it("builds an Arabic verification email with escaped content", () => {
    const email = buildVerificationEmail({ name: "سارة <test>", verificationUrl: "https://hassa.com/verify?token=abc&x=1" });
    expect(email.subject).toContain("أكد بريدك");
    expect(email.html).toContain("سارة &lt;test&gt;");
    expect(email.html).toContain("https://hassa.com/verify?token=abc&amp;x=1");
  });

  it("sends through Gmail SMTP when an app password is configured", async () => {
    process.env.GMAIL_SMTP_USER = "hassa.notifications@gmail.com";
    process.env.GMAIL_SMTP_APP_PASSWORD = "gmail-app-password";
    process.env.GMAIL_SMTP_FROM_EMAIL = "هسّا <hassa.notifications@gmail.com>";
    const sendMail = vi.fn().mockResolvedValue({ messageId: "gmail-message-id" });
    nodemailerMock.createTransport.mockReturnValue({ sendMail });

    await expect(sendEmail({ to: "customer@example.com", subject: "Test", html: "<p>Test</p>" })).resolves.toEqual({ sent: true, id: "gmail-message-id" });
    expect(nodemailerMock.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "hassa.notifications@gmail.com", pass: "gmail-app-password" },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "هسّا <hassa.notifications@gmail.com>",
      to: "customer@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
  });

  it("reports incomplete Gmail configuration without attempting delivery", async () => {
    process.env.GMAIL_SMTP_USER = "hassa.notifications@gmail.com";
    delete process.env.GMAIL_SMTP_APP_PASSWORD;
    delete process.env.GMAIL_SMTP_PASSWORD;
    delete process.env.RESEND_API_KEY;

    await expect(sendEmail({ to: "customer@example.com", subject: "Test", html: "<p>Test</p>" })).resolves.toEqual({ sent: false, reason: "missing_gmail_config" });
    expect(nodemailerMock.createTransport).not.toHaveBeenCalled();
  });

  it("reports a missing sender without attempting delivery", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    delete process.env.RESEND_FROM_EMAIL;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(sendEmail({ to: "customer@example.com", subject: "Test", html: "<p>Test</p>" })).resolves.toEqual({ sent: false, reason: "missing_from_email" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports a missing API key without attempting delivery", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(sendEmail({ to: "customer@example.com", subject: "Test", html: "<p>Test</p>" })).resolves.toEqual({ sent: false, reason: "missing_api_key" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
