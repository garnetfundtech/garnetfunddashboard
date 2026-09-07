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
import {
  batchAlertEmail,
  escalationEmail,
  immediateAlertEmail,
  testAlertEmail,
  type EmailBreach,
} from "@/lib/risk-email";

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

/**
 * Addresses added to every message regardless of which §4.4 tier fired.
 *
 * The routing table decides who is responsible for acting on a breach; this is
 * separate, for whoever needs a copy of everything — the person maintaining
 * the system, and an archive of what was actually sent. Comma-separated.
 */
function alwaysRecipients(): string[] {
  const raw = process.env.RISK_EMAIL_ALWAYS;
  if (!raw) return [];
  return raw.split(",").map((a) => a.trim()).filter(Boolean);
}

/** The board, for the button in every alert. */
function dashboardUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/risk` : null;
}

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
/** The address configured for one §4.4 role, independent of any tier. */
export function addressesForRole(role: string): string[] {
  const env = ROLE_ENV[role];
  const value = (env ? process.env[env] : undefined) || process.env.RISK_ALERT_EMAIL;
  if (!value) return [];
  return value.split(",").map((a) => a.trim()).filter(Boolean);
}

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
  return { addresses: [...new Set([...addresses, ...alwaysRecipients()])], roles, unresolved };
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

/** An alert as the email templates want it. */
function toBreach(a: AlertMessage): EmailBreach {
  return {
    label: a.label,
    subject: a.subject,
    value: a.value,
    limitText: a.limitText,
    source: a.source,
  };
}

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

/**
 * The address alerts are sent from.
 *
 * Kept separate from the SMTP username because the two are only the same thing
 * on Gmail. Resend's username is the literal string "resend" for every account,
 * so deriving the sender from it would put `Garnet Fund Risk <resend>` in the
 * From header and the send would be rejected outright.
 */
function senderAddress(user: string): string | null {
  const explicit = process.env.RISK_EMAIL_FROM?.trim();
  if (explicit) return explicit.includes("<") ? explicit : `Garnet Fund Risk <${explicit}>`;
  // A username that is not an address cannot stand in for one.
  if (!user.includes("@")) return null;
  return `Garnet Fund Risk <${user}>`;
}

async function sendEmail(to: string[], subject: string, body: string, html?: string): Promise<boolean> {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass || !to.length) return false;

  const from = senderAddress(user);
  if (!from) {
    console.error(
      `[risk-alert] SMTP_USER "${user}" is not an email address and RISK_EMAIL_FROM is unset, so there is no ` +
        `valid From address. Set RISK_EMAIL_FROM to a verified sender.`,
    );
    return false;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from,
    to: to.join(", "),
    subject,
    text: body,
    ...(html ? { html } : {}),
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

  const mail = immediateAlertEmail({
    breach: toBreach(alert),
    recipients: addresses,
    dashboardUrl: dashboardUrl(),
  });

  const sent = await sendEmail(addresses, mail.subject, mail.text, mail.html).catch(() => false);
  await sendPush(`Garnet Fund Risk: ${heading}`, lineFor(alert));

  await logNotification({
    monitorId: alert.monitorId,
    subject: alert.subject,
    message: mail.text,
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

    const mail = batchAlertEmail({
      breaches: group.map(toBreach),
      recipients: addresses,
      requiresConfirmation: chain,
      dashboardUrl: dashboardUrl(),
    });

    const sent = await sendEmail(addresses, mail.subject, mail.text, mail.html).catch(() => false);

    await logNotification({
      monitorId: "close-of-day-batch",
      subject: null,
      message: mail.text,
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
  const addresses = [
    ...new Set([
      ...[president, faculty]
        .filter(Boolean)
        .flatMap((a) => (a as string).split(",").map((x) => x.trim()).filter(Boolean)),
      ...alwaysRecipients(),
    ]),
  ];

  const mail = escalationEmail({ ...params, recipients: addresses, dashboardUrl: dashboardUrl() });

  const sent = await sendEmail(addresses, mail.subject, mail.text, mail.html).catch(() => false);
  await logNotification({
    monitorId: "allocation-escalation",
    subject: null,
    message: mail.text,
    channel: sent ? "email" : "console",
    recipients: addresses,
  });

  return {
    sent,
    recipients: addresses,
    unresolved: addresses.length ? [] : ["President", "Faculty Advisor"],
  };
}

export type EmailDiagnostics = {
  configured: boolean;
  host: string;
  port: number;
  user: string | null;
  from: string | null;
  /** Every §4.4 role and the address it currently resolves to. */
  routing: { role: string; addresses: string[] }[];
  problems: string[];
};

/**
 * What the alert mailer would actually do, without sending anything.
 *
 * Alerts are rare by design, so a misconfiguration would otherwise stay hidden
 * until the first real breach — the worst possible moment to discover that
 * nothing was ever delivered.
 */
export function inspectEmailConfig(): EmailDiagnostics {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER ?? null;
  const pass = process.env.SMTP_APP_PASSWORD ?? null;
  const problems: string[] = [];

  if (!user) problems.push("SMTP_USER is not set.");
  if (!pass) problems.push("SMTP_APP_PASSWORD is not set.");

  const from = user ? senderAddress(user) : null;
  if (user && !from) {
    problems.push(
      `SMTP_USER "${user}" is not an email address and RISK_EMAIL_FROM is unset, so there is no valid From address.`,
    );
  }

  // Each role's own address, not the combined list of whichever tier it
  // happens to sit in — showing the tier's aggregate next to "President"
  // implies the President is reachable when only the Risk Manager is.
  const roles = [...new Set(Object.values(NOTIFY_RECIPIENTS).flat())].filter(
    (r) => !r.includes("after confirmation"),
  );
  const routing = roles.map((role) => ({ role, addresses: addressesForRole(role) }));
  for (const { role, addresses } of routing) {
    if (!addresses.length) problems.push(`No address configured for "${role}" — alerts routed there go nowhere.`);
  }

  return { configured: Boolean(user && pass && from), host, port, user, from, routing, problems };
}

/**
 * Sends one test message through the real alert path, so a green result means
 * a genuine red would also arrive.
 */
export async function sendTestAlert(to: string[]): Promise<{ ok: boolean; message: string }> {
  const diag = inspectEmailConfig();
  if (!diag.configured) {
    return { ok: false, message: diag.problems.join(" ") || "Mailer is not configured." };
  }
  if (!to.length) return { ok: false, message: "No recipient resolved to send a test to." };

  const mail = testAlertEmail({
    recipients: to,
    sender: diag.from ?? "unknown",
    transport: `${diag.host}:${diag.port}`,
    dashboardUrl: dashboardUrl(),
  });

  try {
    const sent = await sendEmail(to, mail.subject, mail.text, mail.html);
    if (!sent) return { ok: false, message: "The mailer declined to send. Check SMTP credentials." };
    return { ok: true, message: `Test sent to ${to.join(", ")}. Check the inbox, and the spam folder.` };
  } catch (err) {
    // The SMTP server's own rejection is the single most useful thing here —
    // it names a bad app password or an unverified sender directly.
    return { ok: false, message: err instanceof Error ? err.message : "Send failed." };
  }
}
