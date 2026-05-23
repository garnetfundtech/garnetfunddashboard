import type { LivePosition } from "@/lib/types";

const SECTOR_COLORS: Record<string, string> = {
  "Technology":             "#a78bfa",
  "Healthcare":             "#34d399",
  "Financials":             "#60a5fa",
  "Financial Services":     "#60a5fa",
  "Consumer Cyclical":      "#fbbf24",
  "Consumer Defensive":     "#fb923c",
  "Industrials":            "#fb7185",
  "Communication Services": "#22d3ee",
  "Communication":          "#22d3ee",
  "Energy":                 "#facc15",
  "Basic Materials":        "#94a3b8",
  "Materials":              "#94a3b8",
  "Real Estate":            "#f472b6",
  "Utilities":              "#a3e635",
};

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function SectorExposure({
  positions,
  portfolioValue,
}: {
  positions: LivePosition[];
  portfolioValue: number | null;
}) {
  const investedValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalValue = portfolioValue ?? investedValue;
  const cashValue = Math.max(0, totalValue - investedValue);

  const sectorMap = new Map<string, { totalValue: number; dayPnl: number }>();
  for (const p of positions) {
    const s = p.sector ?? "Unknown";
    const existing = sectorMap.get(s) ?? { totalValue: 0, dayPnl: 0 };
    existing.totalValue += p.marketValue;
    existing.dayPnl += p.dayPnl;
    sectorMap.set(s, existing);
  }

  const rows = [...sectorMap.entries()]
    .map(([name, data]) => ({
      name,
      weight: totalValue > 0 ? (data.totalValue / totalValue) * 100 : 0,
      dayPnlPct: data.totalValue > 0 ? (data.dayPnl / data.totalValue) * 100 : null,
      isCash: false,
    }))
    .sort((a, b) => b.weight - a.weight);

  if (cashValue > 0.01) {
    rows.push({
      name: "Cash & Equiv.",
      weight: totalValue > 0 ? (cashValue / totalValue) * 100 : 0,
      dayPnlPct: null,
      isCash: true,
    });
  }

  const hasPositions = positions.length > 0;
  const sectorOnlyCount = rows.filter((r) => !r.isCash).length;

  return (
    <section className="panel flex h-full flex-col overflow-hidden p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <div>
          <p className="caps text-[10px] text-zinc-500">Exposure</p>
          <h2 className="whitespace-nowrap text-[13.5px] font-semibold text-white">By Sector</h2>
        </div>
        <span className="tabular-nums text-[10.5px] text-zinc-500">
          {sectorOnlyCount > 0 ? `${sectorOnlyCount} sectors` : "—"}
        </span>
      </div>

      {!hasPositions ? (
        <p className="text-sm text-zinc-500">No positions to display.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-[5px]">
            {rows.map((r) => {
              const color = r.isCash ? "#52525b" : (SECTOR_COLORS[r.name] ?? "#94a3b8");
              return (
                <div key={r.name} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-300">
                    {r.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-[11.5px] font-medium text-white">
                    {r.weight.toFixed(1)}%
                  </span>
                  {!r.isCash && r.dayPnlPct != null && (
                    <span
                      className={`w-14 shrink-0 text-right tabular-nums text-[10.5px] ${r.dayPnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      {fmtPct(r.dayPnlPct)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
