import type { LivePosition } from "@/lib/types";
import { SECTOR_COLORS, SECTOR_FALLBACK_COLOR } from "@/lib/sectors";

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
          <p className="caps text-[11px] text-ink-3">Exposure</p>
          <h2 className="whitespace-nowrap text-[15px] font-semibold text-ink">By Sector</h2>
        </div>
        <span className="tabular-nums text-[12px] text-ink-3">
          {sectorOnlyCount > 0 ? `${sectorOnlyCount} sectors` : "XX sectors"}
        </span>
      </div>

      {!hasPositions ? (
        <p className="text-sm text-ink-3">No positions to display.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-[5px]">
            {rows.map((r) => {
              const color = r.isCash ? "var(--ink-3)" : (SECTOR_COLORS[r.name] ?? SECTOR_FALLBACK_COLOR);
              return (
                <div key={r.name} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-none"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {r.name}
                    {!r.isCash && r.dayPnlPct != null && (
                      <span
                        className={`ml-1 text-[11px] tabular-nums ${r.dayPnlPct >= 0 ? "text-pos" : "text-neg"}`}
                      >
                        ({fmtPct(r.dayPnlPct)})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-[13px] font-medium text-ink">
                    {r.weight.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
