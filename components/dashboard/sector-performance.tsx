import { cn } from "@/lib/utils";
import type { LivePosition } from "@/lib/types";
import type { SchwabQuoteResponse } from "@/lib/schwab";

const SECTOR_ETFS: { ticker: string; name: string }[] = [
  { ticker: "XLK", name: "Technology" },
  { ticker: "XLV", name: "Healthcare" },
  { ticker: "XLF", name: "Financials" },
  { ticker: "XLY", name: "Consumer Cyclical" },
  { ticker: "XLP", name: "Consumer Defensive" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLC", name: "Communication" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLB", name: "Basic Materials" },
  { ticker: "XLRE", name: "Real Estate" },
  { ticker: "XLU", name: "Utilities" },
];

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function PctBadge({ value }: { value: number | null | undefined }) {
  const ok = value != null && Number.isFinite(value);
  const positive = ok && value! >= 0;
  return (
    <span
      className={cn(
        "tabular-nums text-sm font-semibold",
        !ok ? "text-zinc-600" : positive ? "text-emerald-400" : "text-rose-400",
      )}
    >
      {fmtPct(value)}
    </span>
  );
}

/** Weighted day P&L % per sector from our portfolio */
function buildFundSectors(positions: LivePosition[]) {
  const sectors = new Map<string, { totalValue: number; weightedDayPnl: number }>();
  for (const p of positions) {
    const s = p.sector ?? "Unknown";
    const existing = sectors.get(s) ?? { totalValue: 0, weightedDayPnl: 0 };
    existing.totalValue += p.marketValue;
    existing.weightedDayPnl += p.dayPnl;
    sectors.set(s, existing);
  }
  const totalPortfolioValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  return [...sectors.entries()]
    .map(([name, data]) => ({
      name,
      weight: totalPortfolioValue > 0 ? (data.totalValue / totalPortfolioValue) * 100 : 0,
      dayPnlDollars: data.weightedDayPnl,
      dayPnlPct: data.totalValue > 0 ? (data.weightedDayPnl / data.totalValue) * 100 : null,
    }))
    .sort((a, b) => b.weight - a.weight);
}

export function SectorPerformance({
  positions,
  etfQuotes,
}: {
  positions: LivePosition[];
  etfQuotes: Record<string, SchwabQuoteResponse> | null;
}) {
  const fundSectors = buildFundSectors(positions);
  const hasPositions = positions.length > 0;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* Panel 1: Our portfolio sectors */}
      <section className="panel p-4">
        <p className="caps-label mb-3">Our Sectors</p>
        {!hasPositions ? (
          <p className="text-sm text-zinc-500">No positions to display.</p>
        ) : (
          <div className="space-y-2">
            {fundSectors.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm text-zinc-200">{s.name}</span>
                    <PctBadge value={s.dayPnlPct} />
                  </div>
                  {/* Weight bar */}
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[#8e0604]"
                      style={{ width: `${Math.min(100, s.weight)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    {s.weight.toFixed(1)}% of portfolio
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Panel 2: Market sector ETFs */}
      <section className="panel p-4">
        <p className="caps-label mb-3">Market Sectors (SPDR ETFs)</p>
        {!etfQuotes ? (
          <p className="text-sm text-zinc-500">Market data unavailable — Schwab not connected.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {SECTOR_ETFS.map(({ ticker, name }) => {
              const q = etfQuotes[ticker]?.quote;
              const price = q?.lastPrice;
              const changePct = q?.netPercentChange;
              return (
                <div
                  key={ticker}
                  className="flex items-center justify-between rounded-[8px] bg-white/[0.03] px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium text-zinc-200">{ticker}</p>
                    <p className="text-[11px] text-zinc-500">{name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs tabular-nums text-zinc-300">
                      {price != null ? `$${price.toFixed(2)}` : "—"}
                    </p>
                    <PctBadge value={changePct} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
