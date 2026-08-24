import { requireRole } from "@/lib/auth";
import { getEffectiveLimits } from "@/lib/risk-thresholds";
import { createAdminClient } from "@/lib/supabase/admin";
import { RiskAdminClient } from "@/components/dashboard/risk-admin-client";
import type { BreachLogRow } from "@/components/dashboard/risk-admin-client";

export default async function RiskAdminPage() {
  await requireRole(["admin", "developer", "pm"]);

  const limits = await getEffectiveLimits();
  const admin = createAdminClient();
  const { data } = await admin
    .from("risk_breach_log")
    .select("id, fired_at, limit_id, limit_label, target, actual_value, drift_or_trade, resolved_at, note")
    .order("fired_at", { ascending: false })
    .limit(100);

  return <RiskAdminClient limits={limits} breachLog={(data ?? []) as BreachLogRow[]} />;
}
