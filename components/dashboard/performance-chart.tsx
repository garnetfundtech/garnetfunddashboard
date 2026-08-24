"use client";

import { THEME } from "@/lib/theme-colors";

import { useState, useEffect, useCallback, useRef } from "react";
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

type RangeCacheEntry = {
  benchmarkData: BenchmarkCandle[];
  portfolioCandles: { date: string; portfolio: number | null }[];
};

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
    <div className="rounded-none bg-paper-2 backdrop-blur-2xl border border-line-2 px-3 py-2 text-xs shadow-2xl">
      <p className="mb-1.5 text-ink-2">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.dataKey}
          className={`font-medium tabular-nums ${
            entry.value == null ? "text-ink" : entry.value >= 0 ? "text-pos" : "text-neg"
          }`}
        >
          {entry.dataKey === "portfolio" ? "Garnet" : "S&P 500"}:{" "}
          {entry.value == null ? "—" : `${entry.value >= 0 ? "+" : ""}${Number(entry.value).toFixed(2)}%`}
        </p>
      ))}
    </div>
  );
}

async function fetchOneRange(r: Range): Promise<RangeCacheEntry | null> {
  try {
    const [benchRes, portRes] = await Promise.allSettled([
      fetch(`/api/schwab/market/price-history?period=${r}`).then((res) => res.json()),
      fetch(`/api/schwab/portfolio/performance?period=${r}`).then((res) => res.json()),
    ]);
    const benchmarkData =
      benchRes.status === "fulfilled" && benchRes.value.ok && benchRes.value.candles?.length
        ? (benchRes.value.candles as BenchmarkCandle[])
        : null;
    if (!benchmarkData) return null;
    const portfolioCandles =
      portRes.status === "fulfilled" && portRes.value.ok && portRes.value.candles?.length
        ? portRes.value.candles
        : [];
    return { benchmarkData, portfolioCandles };
  } catch {
    return null;
  }
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

  // The draw-in animation plays exactly once, for whatever's on screen the
  // first time this chart mounts. Every later update — a range switch, a
  // background refresh, cached data snapping in — updates the line in place
  // with no replay.
  const hasAnimatedRef = useRef(false);
  const [isFirstPaint, setIsFirstPaint] = useState(true);

  // Ranges already fetched this session, so flipping back to one is instant.
  const cacheRef = useRef<Map<Range, RangeCacheEntry>>(new Map());

  const fetchRange = useCallback(async (r: Range, { showLoading = true } = {}) => {
    const cached = cacheRef.current.get(r);
    if (cached) {
      setBenchmarkData(cached.benchmarkData);
      setPortfolioCandles(cached.portfolioCandles);
      setError(false);
      return;
    }

    if (showLoading) setLoading(true);
    setError(false);
    const result = await fetchOneRange(r);
    if (result) {
      cacheRef.current.set(r, result);
      setBenchmarkData(result.benchmarkData);
      setPortfolioCandles(result.portfolioCandles);
    } else {
      setError(true);
      setPortfolioCandles([]);
    }
    if (showLoading) setLoading(false);
  }, []);

  // Initial mount: seed YTD from SSR data, fetch its portfolio overlay, then
  // quietly prefetch every other range in the background so clicking between
  // them is instant instead of waiting on a live fetch each time.
  useEffect(() => {
    let cancelled = false;

    async function seedAndPrefetch() {
      if (initialBenchmark.length > 0) {
        cacheRef.current.set("YTD", { benchmarkData: initialBenchmark, portfolioCandles: [] });
        const json = await fetch(`/api/schwab/portfolio/performance?period=YTD`)
          .then((r) => r.json())
          .catch(() => null);
        if (cancelled) return;
        if (json?.ok && json.candles?.length) {
          setPortfolioCandles(json.candles);
          cacheRef.current.set("YTD", { benchmarkData: initialBenchmark, portfolioCandles: json.candles });
        }
      } else {
        await fetchRange("YTD");
      }

      // First paint's animation window has passed once initial data is in —
      // anything from here on (prefetches landing, range switches) updates
      // in place.
      hasAnimatedRef.current = true;
      setIsFirstPaint(false);

      for (const r of RANGES) {
        if (cancelled) return;
        if (r === "YTD" || cacheRef.current.has(r)) continue;
        await fetchOneRange(r).then((result) => {
          if (!cancelled && result) cacheRef.current.set(r, result);
        });
      }
    }

    void seedAndPrefetch();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount by design
  }, []);

  function handleRangeChange(r: Range) {
    setRange(r);
    void fetchRange(r);
  }

  // Build portfolio lookup by date
  const portfolioByDate = new Map(portfolioCandles.map((c) => [c.date, c.portfolio]));

  const data: ChartPoint[] = benchmarkData.map((c) => ({
    ...c,
    portfolio: portfolioByDate.get(c.date) ?? null,
  }));

  const interval = tickInterval(data.length, range);
  const hasPortfolio = !cashOnlyMode && portfolioCandles.length > 0;
  const shouldAnimate = isFirstPaint && !hasAnimatedRef.current;

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="caps-label">Performance</p>
          <h2 className="text-sm font-semibold text-ink">
            {hasPortfolio ? "Portfolio vs S&P 500" : "S&P 500 (SPY)"}
          </h2>
        </div>
        <div className="flex items-center gap-0.5 rounded-none border border-line bg-paper-3 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              disabled={loading}
              className={`rounded-none px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                r === range
                  ? "bg-garnet-soft text-garnet"
                  : "text-ink-3 hover:bg-paper-2 hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4">
        {hasPortfolio && (
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="h-0.5 w-3.5 rounded-none bg-garnet" />
            Garnet
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className="h-0.5 w-3.5 rounded-none bg-ink-3" />
          S&amp;P 500
        </span>
        {hasPortfolio && portfolioCandles.length > 0 && benchmarkData.length > 0 && (() => {
          const gfEnd = portfolioCandles[portfolioCandles.length - 1]?.portfolio;
          const spyEnd = benchmarkData[benchmarkData.length - 1]?.value;
          if (gfEnd == null || spyEnd == null) return null;
          const alpha = gfEnd - spyEnd;
          return (
            <span className="whitespace-nowrap rounded-none border border-line bg-paper-3 px-2 py-[1px] text-[12px] text-ink">
              Alpha <span className={`tabular-nums ${alpha >= 0 ? "text-pos" : "text-neg"}`}>
                {alpha >= 0 ? "+" : ""}{alpha.toFixed(2)}%
              </span>
            </span>
          );
        })()}
        {loading && <span className="text-[11px] text-ink-3 animate-pulse">Loading…</span>}
        {error && !loading && <span className="text-[11px] text-neg">Data unavailable</span>}
      </div>

      <div className="min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-ink-3">
            {loading ? "Fetching market data…" : "No benchmark data available"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={THEME.garnet} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={THEME.garnet} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="benchmarkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={THEME.ink3} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={THEME.ink3} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.line} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: THEME.ink3, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={interval}
              />
              <YAxis
                tick={{ fill: THEME.ink3, fontSize: 10 }}
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: THEME.line2, strokeWidth: 1 }} />
              {hasPortfolio && (
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  stroke={THEME.garnet}
                  strokeWidth={2}
                  fill="url(#portfolioGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: THEME.garnet, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={shouldAnimate}
                  animationDuration={600}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                name="benchmark"
                stroke={THEME.ink3}
                strokeWidth={1.5}
                fill="url(#benchmarkGrad)"
                dot={false}
                activeDot={{ r: 3, fill: THEME.ink3, strokeWidth: 0 }}
                isAnimationActive={shouldAnimate}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
