import { MacroPageClient } from "@/components/dashboard/macro-page-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { fetchFredSeries, toYearOverYearPct } from "@/lib/fred";

export default async function MacroPage() {
  await enforceNavAccess("/macro");

  let series: Record<string, Awaited<ReturnType<typeof fetchFredSeries>>> = {};
  try {
    const [t10y2y, cpi, pce, dff, unrate] = await Promise.all([
      fetchFredSeries("T10Y2Y", { observationStart: "2005-01-01" }),
      fetchFredSeries("CPIAUCSL", { observationStart: "2010-01-01" }),
      fetchFredSeries("PCEPILFE", { observationStart: "2010-01-01" }),
      fetchFredSeries("DFF", { observationStart: "2005-01-01" }),
      fetchFredSeries("UNRATE", { observationStart: "2005-01-01" }),
    ]);
    series = {
      T10Y2Y: t10y2y,
      CPI_YOY: toYearOverYearPct(cpi),
      PCEPILFE: pce,
      DFF: dff,
      UNRATE: unrate,
    };
  } catch {
    series = {};
  }

  return (
    <div className="space-y-3">
      <MacroPageClient series={series} />
    </div>
  );
}
