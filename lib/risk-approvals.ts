/**
 * Position approvals — Build Specification §3.4.
 *
 * "These fields are not available from any feed." The IPS requires the Risk
 * Manager to approve sizing before any trade is placed and to record the
 * approval and any conditions [IPS I.a, IV.c step 5]; the price target,
 * defined-risk maximum, assigned analyst and option flags all come from the
 * same moment. Without this table, roughly a third of the §4.2 position table
 * has nothing to display and several of its alerts can never fire.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { PositionApproval, Team } from "@/lib/risk-engine";

const COLUMNS =
  "id, symbol, team, sector, approved_size_pct, approval_date, approved_by, monitoring_conditions, " +
  "stop_order_confirmed, stop_order_ref, defined_risk_max_loss, price_target, analyst_id, " +
  "thesis_driven, short_expiry_approved, gain_unrelated_to_thesis, notes, created_at, updated_at, closed_at";

export type ApprovalInput = {
  symbol: string;
  team: Team | null;
  sector: string | null;
  approvedSizePct: number | null;
  approvalDate: string | null;
  monitoringConditions: string | null;
  stopOrderConfirmed: boolean;
  stopOrderRef: string | null;
  definedRiskMaxLoss: number | null;
  priceTarget: number | null;
  analystId: string | null;
  thesisDriven: boolean;
  shortExpiryApproved: boolean;
  gainUnrelatedToThesis: boolean;
  notes: string | null;
};

/**
 * Open approvals keyed by symbol, with the assigned analyst's name resolved.
 *
 * Returns an empty map rather than throwing when the table is missing: a
 * dashboard that renders the feed-derived columns and leaves the entry-form
 * columns blank is far more useful than one that fails to render at all.
 */
export async function getOpenApprovals(): Promise<Map<string, PositionApproval>> {
  try {
    const admin = createAdminClient();
    const { data: raw, error } = await admin.from("position_approvals").select(COLUMNS).is("closed_at", null);
    if (error || !raw) return new Map();
    // The column list is assembled from a constant, so supabase-js cannot infer
    // the row shape; PositionApproval is the contract this table is built to.
    const data = raw as unknown as PositionApproval[];

    const analystIds = [...new Set(data.map((r) => r.analyst_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (analystIds.length) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, full_name, email")
        .in("id", analystIds);
      for (const p of profiles ?? []) {
        names.set(p.id, (p.full_name as string | null) ?? (p.email as string));
      }
    }

    return new Map(
      data.map((r) => [
        r.symbol as string,
        { ...(r as unknown as PositionApproval), analyst_name: r.analyst_id ? (names.get(r.analyst_id) ?? null) : null },
      ]),
    );
  } catch {
    return new Map();
  }
}

export async function listApprovals(includeClosed = false): Promise<PositionApproval[]> {
  try {
    const admin = createAdminClient();
    let query = admin.from("position_approvals").select(COLUMNS).order("approval_date", { ascending: false });
    if (!includeClosed) query = query.is("closed_at", null);
    const { data } = await query;
    return (data ?? []) as unknown as PositionApproval[];
  } catch {
    return [];
  }
}

export async function upsertApproval(input: ApprovalInput, approvedBy: string): Promise<void> {
  const admin = createAdminClient();
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) throw new Error("A ticker is required.");

  const row = {
    symbol,
    team: input.team,
    sector: input.sector,
    approved_size_pct: input.approvedSizePct,
    approval_date: input.approvalDate,
    approved_by: approvedBy,
    monitoring_conditions: input.monitoringConditions,
    stop_order_confirmed: input.stopOrderConfirmed,
    stop_order_ref: input.stopOrderRef,
    defined_risk_max_loss: input.definedRiskMaxLoss,
    price_target: input.priceTarget,
    analyst_id: input.analystId,
    thesis_driven: input.thesisDriven,
    short_expiry_approved: input.shortExpiryApproved,
    gain_unrelated_to_thesis: input.gainUnrelatedToThesis,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("position_approvals")
    .select("id")
    .eq("symbol", symbol)
    .is("closed_at", null)
    .maybeSingle();

  const { error } = existing
    ? await admin.from("position_approvals").update(row).eq("id", existing.id)
    : await admin.from("position_approvals").insert(row);
  if (error) throw error;
}

/**
 * Closes an approval instead of deleting it. The Governance Document requires
 * every transaction record to survive [Gov. IV.a], and next semester's team
 * re-approving the same ticker must not erase this one.
 */
export async function closeApproval(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("position_approvals")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * The approval record as a row for the Google Drive transaction log [§3.4,
 * Gov. IV.a: date, amount, security, and rationale]. The dashboard does not
 * replace the Drive; it exports something that can be filed in it.
 */
export function approvalToCsvRow(a: PositionApproval): Record<string, string> {
  return {
    "Approval date": a.approval_date ?? "",
    Security: a.symbol,
    Team: a.team ?? "",
    Sector: a.sector ?? "",
    "Approved size (% NAV)": a.approved_size_pct != null ? String(a.approved_size_pct) : "",
    "Price target": a.price_target != null ? String(a.price_target) : "",
    "Stop order confirmed": a.stop_order_confirmed ? "yes" : "no",
    "Stop order reference": a.stop_order_ref ?? "",
    "Defined-risk max loss": a.defined_risk_max_loss != null ? String(a.defined_risk_max_loss) : "",
    "Assigned analyst": a.analyst_name ?? "",
    "Monitoring conditions": a.monitoring_conditions ?? "",
    "Thesis-driven (long premium)": a.thesis_driven ? "yes" : "no",
    "Short-expiry approved": a.short_expiry_approved ? "yes" : "no",
    Rationale: a.notes ?? "",
  };
}
