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
      <PageHeader
        kicker="Risk"
        title="Risk Monitor"
        subtitle="Net / gross / beta up top, every limit red · yellow · green. The fund's status in ten seconds."
      />
      <RiskMonitor model={model} />
    </div>
  );
}
