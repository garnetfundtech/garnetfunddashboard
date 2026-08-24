import { RiskMonitor } from "@/components/dashboard/risk-monitor";
import { buildSampleModel } from "@/lib/risk-sample";

/**
 * No-login preview of the Risk Monitor on the sample long/short book. Useful
 * for the board walkthrough and for verifying the UI without Schwab/Supabase
 * credentials. Safe to remove once the live page is the canonical view.
 */
export const dynamic = "force-static";

export default function RiskPreviewPage() {
  const model = buildSampleModel("2026-07-15T14:30:00.000Z");

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
          <h1 className="page-title">Risk Monitor (Sample Preview)</h1>
          <span className="text-[13.5px] text-ink-3">No login required</span>
        </div>
        <RiskMonitor model={model} />
      </div>
    </div>
  );
}
