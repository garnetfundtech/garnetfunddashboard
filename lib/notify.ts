/**
 * Notification delivery for the Wave 1 alert system (§4.4).
 *
 * Two rules from the spec shape everything here:
 *
 *   Only red notifies. Yellow is visible on the dashboard and in the alert
 *   log, nothing more. "The Risk Manager is not notified for every warning,
 *   only when a limit is actually broken."
 *
 *   One message per episode, sent when the metric first crosses into red. No
 *   repeat while the episode stays open, and nothing when it returns to green.
 *   Several close-of-day reds on the same day arrive as a single batched email.
 *
 * Recipients resolve from the §4.4 routing table to real addresses via env.
 * A role with no configured address is reported in the send result rather than
 * silently dropped — an alert nobody received must not look like one that was
 * delivered.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotifyTier } from "@/lib/risk-parameters";
import { NOTIFY_RECIPIENTS } from "@/lib/risk-parameters";

export type NotificationChannel = "console" | "email" | "push";

/** The roles §4.4 routes to, and the env var each reads from. */
const ROLE_ENV: Record<string, string> = {
  "Risk Manager": "RISK_EMAIL_RISK_MANAGER",
  President: "RISK_EMAIL_PRESIDENT",
  "Relevant PM": "RISK_EMAIL_PMS",
  "Head of Operations": "RISK_EMAIL_OPERATIONS",
  "President (after confirmation)": "RISK_EMAIL_PRESIDENT",
  "Faculty Advisor (after confirmation)": "RISK_EMAIL_FACULTY",
};

export type ResolvedRecipients = {
  addresses: string[];
  roles: string[];
  /** Roles the routing table names but for which no address is configured. */
  unresolved: string[];
};

/**
 * Resolves a §4.4 tier to addresses.
 *
 * The two "after confirmation" roles on the allocation chain are deliberately
 * excluded here: IPS VIII.b requires the Risk Manager to confirm the breach
 * before the President and Faculty Advisor hear about it, so this send goes to
 * the Risk Manager alone and the escalation is a separate, human-triggered
 * action from the alert log.
 */
export function resolveRecipients(tier: Exclude<NotifyTier, "none">): ResolvedRecipients {
  const fallback = process.env.RISK_ALERT_EMAIL;
  const roles = NOTIFY_RECIPIENTS[tier].filter((r) => !r.includes("after confirmation"));

  const addresses: string[] = [];
  const unresolved: string[] = [];
  for (const role of roles) {
    const env = ROLE_ENV[role];
    const value = env ? process.env[env] : undefined;
    const resolved = value || fallback;
    if (resolved) addresses.push(...resolved.split(",").map((a) => a.trim()).filter(Boolean));
    else unresolved.push(role);
  }
  return { addresses: [...new Set(addresses)], roles, unresolved };
}

/** One red, ready to send. */
export type AlertMessage = {
  monitorId: string;
  label: string;
  /** The position symbol for a per-position rule; null for portfolio-level. */
  subject: string | null;
  value: string;
  limitText: string;
  tier: Exclude<NotifyTier, "none">;
  source: string;
};

function lineFor(a: AlertMessage): string {
  const where = a.subject ? ` — ${a.subject}` : "";
  return `${a.label}${where}: ${a.value} against ${a.limitText} [${a.source}]`;
}

async function logNotification(params: {
  monitorId: string;
  subject: string | null;
  message: string;
  channel: NotificationChannel;
  recipients: string[];
}) {
  try {
    const admin = createAdminClient();
    await admin.from("risk_notifications").insert({
      limit_id: params.subject ? `${params.monitorId}:${params.subject}` : params.monitorId,
      status: "red",
      message: `${params.message}${params.recipients.length ? `\n\nSent to: ${params.recipients.join(", ")}` : ""}`,
      channel: params.channel,
    });
  } catch {
    // A logging failure must never stop the send itself.
  }
}

async function sendEmail(to: string[], subject: string, body: string): Promise<boolean> {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass || !to.length) return false;

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from: `Garnet Fund Risk <${user}>`,
    to: to.join(", "),
    subject,
    text: body,
  });
  return true;
}

async function sendPush(title: string, body: string): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: { Title: title, Priority: "urgent", Tags: "rotating_light" },
    body,
  }).catch(() => {
    // Best-effort: a push failure must never block the email.
  });
}

export type SendResult = { sent: boolean; recipients: string[]; unresolved: string[] };

/**
 * Sends one intraday red immediately. §4.4: the stop-loss, stop-order,
 * position-cap, trading-calendar and margin-debit reds are the
 * intraday-sensitive limits — a batched inbox is the wrong channel for a
 * limit that is being broken right now.
 */
export async function sendImmediate(alert: AlertMessage): Promise<SendResult> {
  const { addresses, unresolved } = resolveRecipients(alert.tier);
  const heading = alert.subject ? `${alert.label} — ${alert.subject}` : alert.label;
  const body = [
    `RED — ${lineFor(alert)}`,
    "",
    "Detected immediately. This is one of the intraday-sensitive limits in IPS §4.4.",
    "No further message will be sent while this episode stays open.",
  ].join("\n");

  const sent = await sendEmail(addresses, `[Garnet Fund Risk] RED — ${heading}`, body).catch(() => false);
  await sendPush(`Garnet Fund Risk: ${heading}`, lineFor(alert));

  await logNotification({
    monitorId: alert.monitorId,
    subject: alert.subject,
    message: body,
    channel: sent ? "email" : "console",
    recipients: addresses,
  });
  console.log(`[risk-alert] RED ${alert.monitorId}${alert.subject ? `:${alert.subject}` : ""} → ${addresses.join(", ") || "no recipient configured"}`);

  return { sent, recipients: addresses, unresolved };
}

/**
 * Sends the close-of-day batch as a single message per tier. Called once, at
 * the end of the daily evaluation, with every red that opened today.
 */
export async function sendCloseOfDayBatch(alerts: AlertMessage[]): Promise<SendResult[]> {
  if (!alerts.length) return [];

  const byTier = new Map<Exclude<NotifyTier, "none">, AlertMessage[]>();
  for (const a of alerts) {
    byTier.set(a.tier, [...(byTier.get(a.tier) ?? []), a]);
  }

  const results: SendResult[] = [];
  for (const [tier, group] of byTier) {
    const { addresses, unresolved } = resolveRecipients(tier);
    const chain = tier === "close-chain";
    const body = [
      `${group.length} limit${group.length === 1 ? "" : "s"} entered RED today.`,
      "",
      ...group.map((a) => `• ${lineFor(a)}`),
      "",
      chain
        ? "IPS VIII.b requires the Risk Manager to confirm this breach before the President and Faculty Advisor are notified. Confirm it from the alert log to escalate."
        : "Each of these is one episode. No further message will be sent while it stays open, and none when it returns to green.",
    ].join("\n");

    const sent = await sendEmail(
      addresses,
      `[Garnet Fund Risk] Close of day — ${group.length} red${group.length === 1 ? "" : "s"}`,
      body,
    ).catch(() => false);

    await logNotification({
      monitorId: "close-of-day-batch",
      subject: null,
      message: body,
      channel: sent ? "email" : "console",
      recipients: addresses,
    });
      console.log(`[risk-alert] close-of-day batch (${tier}): ${group.length} red(s) → ${addresses.join(", ") || "no recipient configured"}`);

    results.push({ sent, recipients: addresses, unresolved });
  }
  return results;
}

/**
 * The IPS VIII.b escalation: sent only after the Risk Manager has confirmed an
 * allocation breach from the alert log. Deliberately not automatic — the IPS
 * requires this specific chain, and the confirmation step is the chain.
 */
export async function sendAllocationEscalation(params: {
  label: string;
  value: string;
  limitText: string;
  note: string;
  confirmedBy: string;
}): Promise<SendResult> {
  const president = process.env.RISK_EMAIL_PRESIDENT || process.env.RISK_ALERT_EMAIL;
  const faculty = process.env.RISK_EMAIL_FACULTY || process.env.RISK_ALERT_EMAIL;
  const addresses = [...new Set([president, faculty].filter(Boolean) as string[])].flatMap((a) =>
    a.split(",").map((x) => x.trim()).filter(Boolean),
  );

  const body = [
    `The Risk Manager has confirmed an allocation breach [IPS VIII.b].`,
    "",
    `${params.label}: ${params.value} against ${params.limitText}`,
    "",
    `Risk Manager's note: ${params.note || "(none)"}`,
    `Confirmed by: ${params.confirmedBy}`,
  ].join("\n");

  const sent = await sendEmail(addresses, `[Garnet Fund Risk] Confirmed breach — ${params.label}`, body).catch(
    () => false,
  );
  await logNotification({
    monitorId: "allocation-escalation",
    subject: null,
    message: body,
    channel: sent ? "email" : "console",
    recipients: addresses,
  });

  return {
    sent,
    recipients: addresses,
    unresolved: addresses.length ? [] : ["President", "Faculty Advisor"],
  };
}
