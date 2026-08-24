import { PageHeader } from "@/components/dashboard/page-header";
import { RiskMonitor } from "@/components/dashboard/risk-monitor";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getRiskModel } from "@/lib/risk-live";

export const dynamic = "force-dynamic";

export default async function RiskPage() {
  await enforceNavAccess("/risk");
  const model = await getRiskModel();

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Risk Monitor" />
      <RiskMonitor model={model} />
    </div>
  );
}
