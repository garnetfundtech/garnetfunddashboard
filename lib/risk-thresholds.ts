/**
 * Thresholds as configuration, per the risk framework doc: "Please build the
 * thresholds as configuration rather than hard-coded values, so none of this
 * needs a redeploy."
 *
 * `lib/risk-parameters.ts` stays the source of defaults — every limit, its
 * label, unit, cadence, and note. This module overlays any rows found in the
 * `risk_thresholds` table on top of those defaults. A limit with no override
 * row behaves exactly as it does today; nothing here changes behavior until
 * someone actually edits a threshold through the admin UI.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { RISK_LIMITS, type RiskLimit } from "@/lib/risk-parameters";

export type ThresholdOverride = {
  limit_id: string;
  green: number | null;
  yellow: number | null;
  range_green_low: number | null;
  range_green_high: number | null;
  range_yellow_low: number | null;
  range_yellow_high: number | null;
  updated_by: string | null;
  updated_at: string;
};

function applyOverride(limit: RiskLimit, o: ThresholdOverride | undefined): RiskLimit {
  if (!o) return limit;
  const next: RiskLimit = { ...limit };
  if (o.green != null) next.green = o.green;
  if (o.yellow != null) next.yellow = o.yellow;
  if (o.range_green_low != null && o.range_green_high != null) {
    next.rangeGreen = [o.range_green_low, o.range_green_high];
  }
  if (o.range_yellow_low != null && o.range_yellow_high != null) {
    next.rangeYellow = [o.range_yellow_low, o.range_yellow_high];
  }
  return next;
}

/**
 * The full limit set with any DB overrides applied. Falls back to the pure
 * code defaults if the table doesn't exist yet (migration 0017 not yet run)
 * or the query fails for any reason — thresholds degrading to their hardcoded
 * defaults is always safe.
 */
export async function getEffectiveLimits(): Promise<RiskLimit[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("risk_thresholds").select("*");
    if (error || !data) return RISK_LIMITS;
    const overrides = new Map<string, ThresholdOverride>(data.map((r) => [r.limit_id, r as ThresholdOverride]));
    return RISK_LIMITS.map((l) => applyOverride(l, overrides.get(l.id)));
  } catch {
    return RISK_LIMITS;
  }
}

export type ThresholdField = "green" | "yellow" | "rangeGreen" | "rangeYellow";

/**
 * Applies one threshold edit and writes an audit row in the same call — per
 * the framework doc, every change is logged with the date, old value, new
 * value, and who made it. Only admins/developers reach this (gated by the
 * caller via requireRole), matching "for now I can change the red
 * notification too; the committee-vote lock on red is a later phase."
 */
export async function updateThreshold(params: {
  limitId: string;
  field: ThresholdField;
  value: number | [number, number];
  changedBy: string;
}): Promise<void> {
  const { limitId, field, value, changedBy } = params;
  const admin = createAdminClient();

  const defaults = RISK_LIMITS.find((l) => l.id === limitId);
  const { data: existing } = await admin
    .from("risk_thresholds")
    .select("*")
    .eq("limit_id", limitId)
    .maybeSingle();

  const oldValue =
    field === "rangeGreen"
      ? (existing?.range_green_low ?? defaults?.rangeGreen?.[0] ?? null)
      : field === "rangeYellow"
        ? (existing?.range_yellow_low ?? defaults?.rangeYellow?.[0] ?? null)
        : (existing?.[field] ?? defaults?.[field] ?? null);

  const patch: Record<string, unknown> = { limit_id: limitId, updated_by: changedBy, updated_at: new Date().toISOString() };
  if (field === "green") patch.green = value as number;
  else if (field === "yellow") patch.yellow = value as number;
  else if (field === "rangeGreen") {
    const [low, high] = value as [number, number];
    patch.range_green_low = low;
    patch.range_green_high = high;
  } else if (field === "rangeYellow") {
    const [low, high] = value as [number, number];
    patch.range_yellow_low = low;
    patch.range_yellow_high = high;
  }

  // Preserve whichever other columns already had overrides.
  const { error } = await admin.from("risk_thresholds").upsert(
    { ...(existing ?? {}), ...patch },
    { onConflict: "limit_id" },
  );
  if (error) throw error;

  await admin.from("risk_threshold_history").insert({
    limit_id: limitId,
    field,
    old_value: oldValue == null ? null : String(oldValue),
    new_value: String(Array.isArray(value) ? value.join("–") : value),
    changed_by: changedBy,
  });
}
