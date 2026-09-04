/**
 * The alert log (§4.3) and the notification rules (§4.4).
 *
 * The rule the whole module exists to enforce: alerts are episodes, not
 * checks. An episode opens when a metric crosses into yellow or red and closes
 * when it returns to green. One row per episode. A metric that stays red for
 * ten days generates one row, not ten — and one email, not ten.
 *
 * Yellow opens an episode so drift is visible as it builds, and notifies
 * nobody. Red is the only state that sends anything. A metric that escalates
 * yellow → red keeps the same episode row (it never returned to green) but
 * does notify at the moment it turns red, because that is genuinely new.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCloseOfDayBatch, sendImmediate, type AlertMessage } from "@/lib/notify";
import {
  MONITORS_BY_ID,
  POSITION_RULES_BY_ID,
  type NotifyTier,
  type RiskStatus,
} from "@/lib/risk-parameters";
import { describePositionLimit, type RiskModel } from "@/lib/risk-engine";

type EpisodeRow = {
  id: string;
  monitor_id: string;
  subject: string | null;
  status: "yellow" | "red";
  opened_at: string;
  value_at_trigger: number | null;
  peak_value: number | null;
  notified_at: string | null;
};

/** One evaluated reading, flattened out of the model. */
type Reading = {
  monitorId: string;
  label: string;
  subject: string | null;
  status: RiskStatus;
  value: number | null;
  display: string;
  limitText: string;
  tier: NotifyTier;
  timing: "intraday" | "close";
  source: string;
};

/**
 * Every scored reading on the board: the §4.1 limit strip plus every §4.2 rule
 * on every position. Rules whose status is "na" are skipped entirely — an
 * unscored monitor has no episode to open or close.
 */
export function readingsFrom(model: RiskModel): Reading[] {
  const out: Reading[] = [];

  for (const group of model.monitors) {
    for (const row of group.rows) {
      if (row.status === "na") continue;
      out.push({
        monitorId: row.monitor.id,
        label: row.monitor.label,
        subject: null,
        status: row.status,
        value: row.value,
        display: row.display,
        limitText: row.limitText,
        tier: row.monitor.notify,
        timing: row.monitor.timing,
        source: row.monitor.source,
      });
    }
  }

  for (const position of model.positions) {
    for (const result of Object.values(position.rules)) {
      if (result.status === "na") continue;
      const rule = POSITION_RULES_BY_ID[result.id];
      if (!rule) continue;
      out.push({
        monitorId: result.id,
        label: rule.label,
        subject: position.position.symbol,
        status: result.status,
        value: result.value,
        display: result.display,
        limitText: describePositionLimit(result.id, position, model.config),
        tier: rule.notify,
        timing: rule.timing,
        source: rule.source,
      });
    }
  }

  return out;
}

const key = (monitorId: string, subject: string | null) => `${monitorId}::${subject ?? ""}`;

export type EpisodeResult = {
  opened: number;
  closed: number;
  escalated: number;
  notified: number;
  /** Roles the §4.4 table names but that have no configured address. */
  unresolvedRecipients: string[];
};

/**
 * Runs episode transitions over the model and fires the notifications §4.4
 * allows.
 *
 * Call once at the close for the full board, and more often intraday with
 * `onlyTiming: "intraday"` for the limits that cannot wait — the stop-loss,
 * the stop-order check, the position caps, the trading calendar, and the
 * margin debit.
 */
export async function evaluateEpisodes(
  model: RiskModel,
  opts: { onlyTiming?: "intraday" | "close"; closeOfDay?: boolean } = {},
): Promise<EpisodeResult> {
  const admin = createAdminClient();
  const result: EpisodeResult = { opened: 0, closed: 0, escalated: 0, notified: 0, unresolvedRecipients: [] };

  let readings = readingsFrom(model);
  if (opts.onlyTiming) readings = readings.filter((r) => r.timing === opts.onlyTiming);
  if (!readings.length) return result;

  const { data: openRows } = await admin
    .from("risk_alert_episodes")
    .select("id, monitor_id, subject, status, opened_at, value_at_trigger, peak_value, notified_at")
    .is("closed_at", null);

  const open = new Map<string, EpisodeRow>(
    ((openRows ?? []) as EpisodeRow[]).map((r) => [key(r.monitor_id, r.subject), r]),
  );

  const batched: AlertMessage[] = [];
  const unresolved = new Set<string>();

  for (const reading of readings) {
    const k = key(reading.monitorId, reading.subject);
    const existing = open.get(k);

    // ── Back to green: close the episode, notify no one ──────────────────
    if (reading.status === "green") {
      if (existing) {
        await admin
          .from("risk_alert_episodes")
          .update({ closed_at: new Date().toISOString() })
          .eq("id", existing.id);
        result.closed++;
      }
      open.delete(k);
      continue;
    }

    const isRed = reading.status === "red";
    // "Peak excursion" is the worst reading seen, which for a floor breach
    // (net exposure below 20%, P&L below the stop) is the most negative.
    const nextPeak = (() => {
      if (reading.value == null) return existing?.peak_value ?? null;
      if (existing?.peak_value == null) return reading.value;
      return Math.abs(reading.value) > Math.abs(existing.peak_value) ? reading.value : existing.peak_value;
    })();

    // ── New episode ──────────────────────────────────────────────────────
    if (!existing) {
      const shouldNotify = isRed && reading.tier !== "none";
      const { data: inserted } = await admin
        .from("risk_alert_episodes")
        .insert({
          monitor_id: reading.monitorId,
          monitor_label: reading.label,
          subject: reading.subject,
          status: reading.status,
          value_at_trigger: reading.value,
          threshold: reading.limitText,
          peak_value: reading.value,
        })
        .select("id")
        .maybeSingle();
      result.opened++;

      if (shouldNotify) {
        const alert = toAlert(reading);
        if (reading.timing === "intraday") {
          const send = await sendImmediate(alert);
          send.unresolved.forEach((r) => unresolved.add(r));
          await markNotified(admin, inserted?.id ?? null, send.recipients);
          result.notified++;
        } else {
          batched.push(alert);
          await markNotified(admin, inserted?.id ?? null, []);
        }
      }
      continue;
    }

    // ── Escalation inside an open episode: yellow → red ──────────────────
    if (isRed && existing.status === "yellow") {
      await admin
        .from("risk_alert_episodes")
        .update({ status: "red", value_at_trigger: reading.value, peak_value: nextPeak })
        .eq("id", existing.id);
      result.escalated++;

      if (reading.tier !== "none") {
        const alert = toAlert(reading);
        if (reading.timing === "intraday") {
          const send = await sendImmediate(alert);
          send.unresolved.forEach((r) => unresolved.add(r));
          await markNotified(admin, existing.id, send.recipients);
          result.notified++;
        } else {
          batched.push(alert);
          await markNotified(admin, existing.id, []);
        }
      }
      continue;
    }

    // ── Still open at the same tier: track the excursion, send nothing ───
    if (nextPeak !== existing.peak_value) {
      await admin.from("risk_alert_episodes").update({ peak_value: nextPeak }).eq("id", existing.id);
    }
  }

  // One batched email for every close-of-day red that opened today.
  if (batched.length && opts.closeOfDay !== false) {
    const sends = await sendCloseOfDayBatch(batched);
    for (const send of sends) send.unresolved.forEach((r) => unresolved.add(r));
    result.notified += batched.length;
  }

  result.unresolvedRecipients = [...unresolved];
  return result;
}

function toAlert(reading: Reading): AlertMessage {
  // "none" never reaches here — the caller checks the tier first — but the
  // type has to be narrowed, and close-to-Risk-Manager is the safe default.
  const tier = (reading.tier === "none" ? "close" : reading.tier) as Exclude<NotifyTier, "none">;
  return {
    monitorId: reading.monitorId,
    label: reading.label,
    subject: reading.subject,
    value: reading.display,
    limitText: reading.limitText,
    tier,
    source: reading.source,
  };
}

async function markNotified(
  admin: ReturnType<typeof createAdminClient>,
  id: string | null,
  recipients: string[],
) {
  if (!id) return;
  await admin
    .from("risk_alert_episodes")
    .update({ notified: recipients, notified_at: new Date().toISOString() })
    .eq("id", id);
}

// ── Stop-loss events (§5.3) ───────────────────────────────────────────────

/**
 * Records any stop that has fired, so the §5.3 list and its post-mortem
 * checkbox have something to show. Idempotent per symbol per day: the daily
 * cron re-detects the same fill until the position leaves the book, and one
 * stop that fired must produce one row, not one per run.
 */
export async function recordStopLossEvents(model: RiskModel): Promise<number> {
  const stopped = model.positions.filter((p) => p.stopped);
  if (!stopped.length) return 0;

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  let written = 0;

  for (const row of stopped) {
    const p = row.position;
    const { data: existing } = await admin
      .from("stop_loss_events")
      .select("id")
      .eq("symbol", p.symbol)
      .gte("detected_at", `${today}T00:00:00Z`)
      .maybeSingle();
    if (existing) continue;

    const { error } = await admin.from("stop_loss_events").insert({
      symbol: p.symbol,
      side: p.side,
      quantity: p.absQuantity,
      cost_basis: p.costBasis,
      fill_price: p.price,
      realized_loss: p.unrealizedPnl < 0 ? Math.abs(p.unrealizedPnl) : 0,
      pnl_pct: p.pnlVsCostPct,
    });
    if (!error) written++;
  }
  return written;
}

// ── Alert log reads ───────────────────────────────────────────────────────

export type AlertLogRow = {
  id: string;
  monitor_id: string;
  monitor_label: string;
  subject: string | null;
  status: "yellow" | "red";
  opened_at: string;
  closed_at: string | null;
  value_at_trigger: number | null;
  threshold: string | null;
  notified: string[] | null;
  notified_at: string | null;
  peak_value: number | null;
  acknowledged_at: string | null;
  resolution_note: string | null;
};

export async function getAlertLog(limit = 200, since?: string): Promise<AlertLogRow[]> {
  try {
    const admin = createAdminClient();
    let query = admin
      .from("risk_alert_episodes")
      .select(
        "id, monitor_id, monitor_label, subject, status, opened_at, closed_at, value_at_trigger, threshold, notified, notified_at, peak_value, acknowledged_at, resolution_note",
      )
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (since) query = query.gte("opened_at", since);
    const { data } = await query;
    return (data ?? []) as AlertLogRow[];
  } catch {
    return [];
  }
}

export async function acknowledgeEpisode(id: string, userId: string, note: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("risk_alert_episodes")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: userId,
      resolution_note: note || null,
    })
    .eq("id", id);
  if (error) throw error;
}

/** A friendlier label for a monitor id, used by the log and the CSV export. */
export function monitorLabel(id: string): string {
  return MONITORS_BY_ID[id]?.label ?? POSITION_RULES_BY_ID[id]?.label ?? id;
}
