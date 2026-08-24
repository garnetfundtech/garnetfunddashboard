/**
 * Notification drivers for the risk alert system.
 *
 * All free: Gmail SMTP (an app password, no signup) for email, and ntfy.sh
 * (no account, no API key) for the intraday phone push that item 5's
 * single-day-move alert needs — a batched inbox is the wrong channel for
 * something that has to interrupt the trading day.
 *
 * Every send also writes to `risk_notifications` regardless of whether the
 * external channel is configured, so the audit trail exists even before
 * Cooper wires up real recipients.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationChannel = "console" | "email" | "push";

export type NotificationPayload = {
  limitId: string;
  status: "yellow" | "red";
  message: string;
};

async function logNotification(payload: NotificationPayload, channel: NotificationChannel) {
  try {
    const admin = createAdminClient();
    await admin.from("risk_notifications").insert({
      limit_id: payload.limitId,
      status: payload.status,
      message: payload.message,
      channel,
    });
  } catch {
    // Logging failure shouldn't block the send itself.
  }
}

async function sendEmail(payload: NotificationPayload): Promise<void> {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  const to = process.env.RISK_ALERT_EMAIL;

  if (!user || !pass || !to) {
    // Not configured — this is the expected state until Cooper sets a
    // recipient. Falls through to the console/DB log below.
    return;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from: `Garnet Fund Risk <${user}>`,
    to,
    subject: `[Garnet Fund Risk] ${payload.status.toUpperCase()} — ${payload.limitId}`,
    text: payload.message,
  });
}

async function sendPush(payload: NotificationPayload): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return; // Not configured yet — falls through to logging only.

  await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: {
      Title: `Garnet Fund Risk: ${payload.limitId}`,
      Priority: payload.status === "red" ? "urgent" : "high",
      Tags: payload.status === "red" ? "rotating_light" : "warning",
    },
    body: payload.message,
  }).catch(() => {
    // ntfy is best-effort — never let a push failure block the batch.
  });
}

/**
 * Sends one notification through every configured channel and logs it
 * regardless. `intraday: true` also attempts push (item 5's single-day-move
 * alert); everything else is email-only, batched at the close.
 */
export async function sendNotification(payload: NotificationPayload, opts: { intraday?: boolean } = {}) {
  await Promise.allSettled([
    sendEmail(payload).then(() => logNotification(payload, "email")),
    opts.intraday ? sendPush(payload).then(() => logNotification(payload, "push")) : Promise.resolve(),
  ]);
  // Always leave a console trace too, since this cron has no other output
  // surface for whoever's watching logs.
  // eslint-disable-next-line no-console
  console.log(`[risk-alert] ${payload.status.toUpperCase()} ${payload.limitId}: ${payload.message}`);
  await logNotification(payload, "console");
}
