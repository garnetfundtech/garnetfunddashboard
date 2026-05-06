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

const RANGES = ["1M", "3M", "6M", "1Y", "YTD"] as const;
type Range = (typeof RANGES)[number];

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-input px-3 py-2 text-xs">
      <p className="mb-1.5 text-zinc-400">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }} className="font-medium">
          {entry.dataKey === "portfolio" ? "Portfolio" : "S&P 500 (SPY)"}:{" "}
          {entry.value >= 0 ? "+" : ""}
          {entry.value.toFixed(2)}%
        </p>
      ))}
    </div>
  );
}

export function PerformanceChart({
  initialBenchmark = [],
}: {
  initialBenchmark?: BenchmarkCandle[];
}) {
  const [range, setRange] = useState<Range>("YTD");
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkCandle[]>(initialBenchmark);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchRange = useCallback(async (r: Range) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/schwab/market/price-history?period=${r}`);
      const json = await res.json();
      if (json.ok && json.candles?.length) {
        setBenchmarkData(json.candles as BenchmarkCandle[]);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // On range change, fetch new data (skip initial YTD since we get it from props)
  useEffect(() => {
    if (range === "YTD" && initialBenchmark.length > 0) {
      setBenchmarkData(initialBenchmark);
      return;
    }
    fetchRange(range);
  }, [range, initialBenchmark, fetchRange]);

  // Add a flat portfolio: 0 key to every data point so Recharts renders the portfolio line.
  // The fund currently holds only cash (no equity positions), so portfolio return is 0%.
  // This will be replaced with real performance data once positions are held.
  const data = benchmarkData.map((c) => ({ ...c, portfolio: 0 }));

  return (
    <section className="panel flex flex-col p-4" style={{ height: 300 }}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="caps-label">Performance</p>
          <h2 className="text-sm font-semibold text-white">Portfolio vs S&P 500 (SPY)</h2>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              disabled={loading}
              className={`rounded-[7px] px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                r === range
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-0.5 w-3.5 rounded-full bg-[#8e0604]" />
          Portfolio
        </span>
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-0.5 w-3.5 rounded-full bg-zinc-500" />
          S&P 500 (SPY)
        </span>
        {loading && (
          <span className="text-[10px] text-zinc-600 animate-pulse">Loading…</span>
        )}
        {error && !loading && (
          <span className="text-[10px] text-rose-500">Live data unavailable</span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            {loading ? "Fetching market data…" : "No benchmark data available"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: -10 }}>
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
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 11 }}
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#2a2f37", strokeWidth: 1 }} />
              {/* Portfolio line — flat at 0 until we have real portfolio performance data */}
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
