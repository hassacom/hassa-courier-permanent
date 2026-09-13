import nodemailer from "nodemailer";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
};

type SentEmail = { sent: true; id: string | null };
type UnsentEmail =
  | { sent: false; reason: "missing_gmail_config" }
  | { sent: false; reason: "missing_api_key" }
  | { sent: false; reason: "missing_from_email" };

function getGmailConfig() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const password = (process.env.GMAIL_SMTP_APP_PASSWORD ?? process.env.GMAIL_SMTP_PASSWORD)?.trim();
  const hasPartialConfig = Boolean(user || password || process.env.GMAIL_SMTP_FROM_EMAIL);
  if (!hasPartialConfig) return null;
  if (!user || !password) return { incomplete: true as const };

  const port = Number(process.env.GMAIL_SMTP_PORT ?? 465);
  return {
    incomplete: false as const,
    user,
    password,
    from: process.env.GMAIL_SMTP_FROM_EMAIL?.trim() || user,
    host: process.env.GMAIL_SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number.isFinite(port) && port > 0 ? port : 465,
    secure: process.env.GMAIL_SMTP_SECURE ? process.env.GMAIL_SMTP_SECURE === "true" : true,
  };
}

export async function sendEmail(input: EmailInput): Promise<SentEmail | UnsentEmail> {
  const gmail = getGmailConfig();
  if (gmail?.incomplete) return { sent: false, reason: "missing_gmail_config" };

  if (gmail) {
    const transporter = nodemailer.createTransport({
      host: gmail.host,
      port: gmail.port,
      secure: gmail.secure,
      auth: { user: gmail.user, pass: gmail.password },
    });
    const result = await transporter.sendMail({
      from: gmail.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { sent: true, id: result.messageId ?? null };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "missing_api_key" };

  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) return { sent: false, reason: "missing_from_email" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email delivery failed (${response.status}): ${detail.slice(0, 240)}`);
  }

  const result = (await response.json()) as { id?: string };
  return { sent: true, id: result.id ?? null };
}

export function buildVerificationEmail(input: { name: string; verificationUrl: string }) {
  return {
    subject: "أكد بريدك الإلكتروني في هسّا",
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#241d17"><h2>أهلًا ${escapeHtml(input.name)}</h2><p>اضغط الزر التالي لتأكيد بريدك الإلكتروني وإكمال التسجيل في هسّا.</p><p><a href="${escapeHtml(input.verificationUrl)}" style="display:inline-block;background:#241d17;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">تأكيد البريد</a></p><p style="color:#746960;font-size:12px">ينتهي رابط التأكيد خلال 24 ساعة.</p></div>`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
