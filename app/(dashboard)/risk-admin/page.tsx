import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getRiskConfig } from "@/lib/risk-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { RiskAdminClient, type ConfigHistoryRow } from "@/components/dashboard/risk-admin-client";

export const dynamic = "force-dynamic";

/** The §7 configuration table and its Decision Log. */
export default async function RiskAdminPage() {
  await enforceNavAccess("/risk-admin");

  const config = await getRiskConfig();

  let history: ConfigHistoryRow[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("risk_config_history")
      .select("id, key, old_value, new_value, reason, changed_at, changed_by")
      .order("changed_at", { ascending: false })
      .limit(200);

    const ids = [...new Set((data ?? []).map((r) => r.changed_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: people } = await admin.from("user_profiles").select("id, full_name, email").in("id", ids);
      for (const p of people ?? []) names.set(p.id, (p.full_name as string | null) ?? (p.email as string));
    }

    history = (data ?? []).map((r) => ({
      id: r.id as string,
      key: r.key as string,
      old_value: (r.old_value as string | null) ?? null,
      new_value: r.new_value as string,
      reason: r.reason as string,
      changed_at: r.changed_at as string,
      changed_by_name: r.changed_by ? (names.get(r.changed_by as string) ?? null) : null,
    }));
  } catch {
    history = [];
  }

  return <RiskAdminClient config={config} history={history} />;
}
