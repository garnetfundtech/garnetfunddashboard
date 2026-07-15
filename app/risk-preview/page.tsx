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
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Garnet Fund · Risk</p>
          <h1 className="text-[20px] font-semibold tracking-tight text-white">Risk Monitor — Sample Preview</h1>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            Illustrative long/short book. No login or live data required — mirrors the in-app /risk page.
          </p>
        </div>
        <RiskMonitor model={model} />
      </div>
    </div>
  );
}
