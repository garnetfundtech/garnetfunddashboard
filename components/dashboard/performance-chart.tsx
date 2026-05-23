"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BenchmarkCandle } from "@/lib/types";

const RANGES = ["1D", "1W", "2W", "1M", "3M", "6M", "1Y", "YTD"] as const;
type Range = (typeof RANGES)[number];

const TICK_DENSITY: Record<Range, number> = {
  "1D":  6,
  "1W":  5,
  "2W":  5,
  "1M":  6,
  "3M":  6,
  "6M":  6,
  "1Y":  8,
  "YTD": 6,
};

function tickInterval(totalPoints: number, range: Range): number {
  const density = TICK_DENSITY[range];
  return Math.max(1, Math.floor(totalPoints / density));
}

type ChartPoint = { date: string; value: number; portfolio: number | null };

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number | null; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] bg-white/10 backdrop-blur-2xl border border-white/[0.12] px-3 py-2 text-xs shadow-2xl">
      <p className="mb-1.5 text-zinc-400">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.dataKey}
          className={`font-medium tabular-nums ${
            entry.value == null ? "text-zinc-300" : entry.value >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {entry.dataKey === "portfolio" ? "Garnet" : "S&P 500"}:{" "}
          {entry.value == null ? "—" : `${entry.value >= 0 ? "+" : ""}${Number(entry.value).toFixed(2)}%`}
        </p>
      ))}
    </div>
  );
}

export function PerformanceChart({
  initialBenchmark = [],
  cashOnlyMode = false,
}: {
  initialBenchmark?: BenchmarkCandle[];
  cashOnlyMode?: boolean;
}) {
  const [range, setRange] = useState<Range>("YTD");
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkCandle[]>(initialBenchmark);
  const [portfolioCandles, setPortfolioCandles] = useState<{ date: string; portfolio: number | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchRange = useCallback(async (r: Range) => {
    setLoading(true);
    setError(false);
    try {
      const [benchRes, portRes] = await Promise.allSettled([
        fetch(`/api/schwab/market/price-history?period=${r}`).then((res) => res.json()),
        fetch(`/api/schwab/portfolio/performance?period=${r}`).then((res) => res.json()),
      ]);

      if (benchRes.status === "fulfilled" && benchRes.value.ok && benchRes.value.candles?.length) {
        setBenchmarkData(benchRes.value.candles as BenchmarkCandle[]);
      } else {
        setError(true);
      }

      if (portRes.status === "fulfilled" && portRes.value.ok && portRes.value.candles?.length) {
        setPortfolioCandles(portRes.value.candles);
      } else {
        setPortfolioCandles([]);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // On initial YTD load, benchmark comes from SSR; still fetch portfolio
  useEffect(() => {
    if (range === "YTD" && initialBenchmark.length > 0) {
      // benchmarkData already initialised from SSR — only fetch portfolio overlay
      void fetch(`/api/schwab/portfolio/performance?period=YTD`)
        .then((r) => r.json())
        .then((json) => {
          if (json.ok && json.candles?.length) setPortfolioCandles(json.candles);
        })
        .catch(() => {});
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) is intentional loading state before async fetch
    void fetchRange(range);
  }, [range, initialBenchmark, fetchRange]);

  // Build portfolio lookup by date
  const portfolioByDate = new Map(portfolioCandles.map((c) => [c.date, c.portfolio]));

  const data: ChartPoint[] = benchmarkData.map((c) => ({
    ...c,
    portfolio: portfolioByDate.get(c.date) ?? null,
  }));

  const interval = tickInterval(data.length, range);
  const hasPortfolio = !cashOnlyMode && portfolioCandles.length > 0;

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="caps-label">Performance</p>
          <h2 className="text-sm font-semibold text-white">
            {hasPortfolio ? "Portfolio vs S&P 500" : "S&P 500 (SPY)"}
          </h2>
        </div>
        <div className="flex items-center gap-0.5 rounded-[7px] border border-white/[0.06] bg-black/30 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              disabled={loading}
              className={`rounded-[5px] px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                r === range
                  ? "bg-[#8e0604]/20 text-[#f4c5c4]"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4">
        {hasPortfolio && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="h-0.5 w-3.5 rounded-full bg-[#8e0604]" />
            Garnet
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-0.5 w-3.5 rounded-full bg-zinc-500" />
          S&amp;P 500
        </span>
        {hasPortfolio && portfolioCandles.length > 0 && benchmarkData.length > 0 && (() => {
          const gfEnd = portfolioCandles[portfolioCandles.length - 1]?.portfolio;
          const spyEnd = benchmarkData[benchmarkData.length - 1]?.value;
          if (gfEnd == null || spyEnd == null) return null;
          const alpha = gfEnd - spyEnd;
          return (
            <span className="whitespace-nowrap rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-[1px] text-[10.5px] text-zinc-300">
              α <span className={`tabular-nums ${alpha >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {alpha >= 0 ? "+" : ""}{alpha.toFixed(2)}%
              </span>
            </span>
          );
        })()}
        {loading && <span className="text-[10px] text-zinc-600 animate-pulse">Loading…</span>}
        {error && !loading && <span className="text-[10px] text-rose-500">Data unavailable</span>}
      </div>

      <div className="min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            {loading ? "Fetching market data…" : "No benchmark data available"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8e0604" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#8e0604" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="benchmarkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#71717a" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#71717a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2329" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#52525b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={interval}
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 10 }}
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#2a2f37", strokeWidth: 1 }} />
              {hasPortfolio && (
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  stroke="#8e0604"
                  strokeWidth={2}
                  fill="url(#portfolioGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: "#8e0604", strokeWidth: 0 }}
                  connectNulls
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                name="benchmark"
                stroke="#52525b"
                strokeWidth={1.5}
                fill="url(#benchmarkGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "#71717a", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
