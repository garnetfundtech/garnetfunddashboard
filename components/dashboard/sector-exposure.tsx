import type { LivePosition } from "@/lib/types";

const SECTOR_COLORS: Record<string, string> = {
  "Technology":            "#a78bfa",
  "Healthcare":            "#34d399",
  "Financials":            "#60a5fa",
  "Financial Services":    "#60a5fa",
  "Consumer Cyclical":     "#fbbf24",
  "Consumer Defensive":    "#fb923c",
  "Industrials":           "#fb7185",
  "Communication Services":"#22d3ee",
  "Communication":         "#22d3ee",
  "Energy":                "#facc15",
  "Basic Materials":       "#94a3b8",
  "Materials":             "#94a3b8",
  "Real Estate":           "#f472b6",
  "Utilities":             "#a3e635",
};

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${n < 0 ? "-" : ""}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${n < 0 ? "-" : ""}$${(abs / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// SVG donut arc path
function polar(angle: number, radius: number, cx: number, cy: number): [number, number] {
  const a = (angle - 0.25) * 2 * Math.PI;
  return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
}

function arcPath(start: number, end: number, ro: number, ri: number, cx: number, cy: number): string {
  if (end - start >= 1) end = start + 0.9999;
  const [x1, y1] = polar(start, ro, cx, cy);
  const [x2, y2] = polar(end, ro, cx, cy);
  const [x3, y3] = polar(end, ri, cx, cy);
  const [x4, y4] = polar(start, ri, cx, cy);
  const large = (end - start) > 0.5 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${ro},${ro} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${ri},${ri} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
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

  // Build donut arcs
  const R = 38, CX = 50, CY = 50, RI = 28;
  const arcs = rows.reduce<Array<typeof rows[0] & { start: number; end: number }>>(
    (acc, r) => {
      const prev = acc[acc.length - 1];
      const start = prev ? prev.end : 0;
      const end = start + r.weight / 100;
      acc.push({ ...r, start, end });
      return acc;
    },
    [],
  );

  const hasPositions = positions.length > 0;
  const sectorOnlyCount = rows.filter((r) => !r.isCash).length;

  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div>
          <p className="caps text-[10px] text-zinc-500">Exposure</p>
          <h2 className="whitespace-nowrap text-[13.5px] font-semibold text-white">By Sector</h2>
        </div>
        <span className="text-[10.5px] text-zinc-500 tabular-nums">{sectorOnlyCount > 0 ? `${sectorOnlyCount} sectors` : "—"}</span>
      </div>

      {!hasPositions ? (
        <p className="text-sm text-zinc-500">No positions to display.</p>
      ) : (
        <div className="flex items-start gap-3">
          {/* Donut */}
          <div className="relative shrink-0">
            <svg viewBox="0 0 100 100" width={92} height={92}>
              {arcs.map((r, i) => (
                <path
                  key={i}
                  d={arcPath(r.start, r.end, R, RI, CX, CY)}
                  fill={r.isCash ? "#3f3f46" : (SECTOR_COLORS[r.name] ?? "#94a3b8")}
                  opacity={r.isCash ? 0.5 : 0.92}
                />
              ))}
              <text x="50" y="47" textAnchor="middle" fill="white" fontSize="8" fontWeight="600" fontFamily="inherit">
                {fmtCompact(totalValue)}
              </text>
              <text x="50" y="56" textAnchor="middle" fill="#71717a" fontSize="5" fontFamily="inherit">
                AUM
              </text>
            </svg>
          </div>
          {/* List */}
          <div className="min-w-0 flex-1 space-y-[3px]">
            {rows.slice(0, 6).map((r) => (
              <div key={r.name} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: r.isCash ? "#52525b" : (SECTOR_COLORS[r.name] ?? "#94a3b8") }}
                />
                <span className="flex-1 truncate text-[11px] text-zinc-300">{r.name}</span>
                <span className="text-[11px] tabular-nums text-zinc-400">{r.weight.toFixed(1)}%</span>
                {!r.isCash && r.dayPnlPct != null && (
                  <span className={`w-12 text-right text-[10.5px] tabular-nums ${r.dayPnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmtPct(r.dayPnlPct)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
