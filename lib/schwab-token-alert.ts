/**
 * The Schwab re-authentication warning.
 *
 * Schwab caps a refresh token at seven days and will not extend it on use, so
 * somebody has to walk the OAuth flow by hand roughly weekly, forever. There
 * is no API-side way around that — no offline grant, no longer-lived token —
 * which makes the only real failure mode nobody *knowing* the clock is
 * running. Until now the countdown lived inside a collapsed `<details>` on
 * /admin and the first sign of trouble was the dashboard going blank.
 *
 * So this is not a fix, it is a reminder: one message while the connection is
 * still up and there is time to act, and one when it has actually lapsed.
 *
 * Read once a day by /api/schwab/token-alert. Everything about *when* to warn
 * lives here; the route only carries the cron guard and the JSON.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { schwabReauthEmail } from "@/lib/risk-email";
import { sendOpsEmail } from "@/lib/notify";

/**
 * How far ahead to warn. Two days rather than one because the cron runs daily
 * and the token pays no attention to weekends: a Sunday expiry warned at 24h
 * lands on a Saturday, which in a student fund means Monday. At 48h there are
 * two runs inside the window, so a single missed or failed run still leaves
 * one warning before the connection dies.
 */
export const WARN_WITHIN_MS = 48 * 60 * 60 * 1000;

/** What the daily check found, whether or not it sent anything. */
export type TokenAlertResult = {
  /** null when the connection is healthy and nothing needed saying. */
  stage: "warning" | "expired" | null;
  /** Present but not yet inside the warning window, or no token at all. */
  reason: string;
  refreshExpiresAt: string | null;
  msRemaining: number | null;
  sent: boolean;
  /** Why a send did not happen, when a stage was reached but nothing went out. */
  sendMessage: string | null;
  recipients: string[];
};

/** Recipients for this alert, falling back to the risk table's catch-all. */
export function alertRecipients(): string[] {
  const raw = process.env.SCHWAB_ALERT_EMAILS || process.env.RISK_ALERT_EMAIL || "";
  return [...new Set(raw.split(",").map((a) => a.trim()).filter(Boolean))];
}

/** /admin, where the re-auth button lives. */
function adminUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/admin` : null;
}

/**
 * "1 day 4 hours", "6 hours", "35 minutes" — two units at most, because the
 * only decision it informs is whether this can wait until tomorrow.
 */
export function humaniseDuration(ms: number): string {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);

  const unit = (n: number, name: string) => `${n} ${name}${n === 1 ? "" : "s"}`;

  if (days > 0) return hours > 0 ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day");
  if (hours > 0) return minutes > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour");
  return unit(Math.max(1, minutes), "minute");
}

/**
 * Runs the check and sends at most one email.
 *
 * De-duplication is the whole reason this touches the database. A token sits
 * inside the 48-hour window for two daily runs, and stays expired
 * indefinitely, so without state the same warning would arrive every morning
 * until someone acted — which is how an alert stops being read. The
 * (stage, refresh_expires_at) pair recorded on the row is what makes it one
 * message per stage per token, and re-authenticating changes the expiry so
 * the next cycle warns afresh with no manual reset.
 */
export async function runSchwabTokenAlert(
  options: { force?: boolean } = {},
): Promise<TokenAlertResult> {
  const admin = createAdminClient();
  const recipients = alertRecipients();

  const base: TokenAlertResult = {
    stage: null,
    reason: "",
    refreshExpiresAt: null,
    msRemaining: null,
    sent: false,
    sendMessage: null,
    recipients,
  };

  const { data: row, error } = await admin
    .from("schwab_tokens")
    .select("refresh_expires_at, needs_reauth, reauth_alert_stage, reauth_alert_sent_for")
    .eq("id", "trader")
    .maybeSingle();

  if (error) {
    // 42703 is undefined_column — migration 0028 hasn't been applied yet.
    const reason =
      error.code === "42703"
        ? "Re-auth alert columns are missing — apply migration 0028."
        : `Could not read schwab_tokens: ${error.message}`;
    return { ...base, reason };
  }

  // No token at all is a setup task, not a lapse: there is no connection to
  // warn about losing, and nowhere to record that we warned. Reported, not
  // emailed, so a project that has never been connected doesn't nag daily.
  if (!row) {
    return { ...base, reason: "No trader token on file — connect Schwab from /admin." };
  }

  const token = row as {
    refresh_expires_at: string | null;
    needs_reauth: boolean | null;
    reauth_alert_stage: "warning" | "expired" | null;
    reauth_alert_sent_for: string | null;
  };

  const refreshExpiresAt = token.refresh_expires_at;
  const expiresAtMs = refreshExpiresAt ? new Date(refreshExpiresAt).getTime() : null;
  const msRemaining = expiresAtMs != null ? expiresAtMs - Date.now() : null;

  // needs_reauth counts as expired on its own. The refresh path sets it only
  // after re-reading the row and confirming the token really is dead
  // (lib/market-data.ts), and it is the one signal available when
  // refresh_expires_at was never recorded — a token stored before the
  // callback started writing that column.
  const dead = token.needs_reauth === true || (msRemaining != null && msRemaining <= 0);
  const expiring = !dead && msRemaining != null && msRemaining <= WARN_WITHIN_MS;

  const stage: "warning" | "expired" | null = dead ? "expired" : expiring ? "warning" : null;

  if (!stage) {
    return {
      ...base,
      refreshExpiresAt,
      msRemaining,
      reason:
        msRemaining == null
          ? "No refresh expiry recorded, and the token is not flagged for re-auth. Re-authenticate to establish the clock."
          : `Healthy — ${humaniseDuration(msRemaining)} left on the refresh token.`,
    };
  }

  // Already said this, about this token.
  const alreadySent =
    token.reauth_alert_stage === stage &&
    (token.reauth_alert_sent_for ?? null) === (refreshExpiresAt ?? null);

  if (alreadySent && !options.force) {
    return {
      ...base,
      stage,
      refreshExpiresAt,
      msRemaining,
      reason: `Already sent the ${stage} notice for this token.`,
    };
  }

  const remainingText = msRemaining != null ? humaniseDuration(msRemaining) : "";
  const mail = schwabReauthEmail({
    stage,
    remainingText,
    expiresAt: refreshExpiresAt,
    recipients,
    adminUrl: adminUrl(),
  });

  const result = await sendOpsEmail({
    to: recipients,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  // Only record it if it actually left. A failed send that marked itself sent
  // would swallow the one warning this whole thing exists to deliver, so a
  // failure deliberately leaves the row untouched and tomorrow's run retries.
  if (result.ok) {
    await admin
      .from("schwab_tokens")
      .update({ reauth_alert_stage: stage, reauth_alert_sent_for: refreshExpiresAt })
      .eq("id", "trader");
  }

  return {
    ...base,
    stage,
    refreshExpiresAt,
    msRemaining,
    sent: result.ok,
    sendMessage: result.message,
    reason: result.ok
      ? `Sent the ${stage} notice.`
      : `Reached the ${stage} stage but the send failed; will retry on the next run.`,
  };
}
