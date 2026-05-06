"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RANGES = ["1M", "3M", "6M", "1Y", "YTD"] as const;
type Range = (typeof RANGES)[number];

// Placeholder series — replaced by live Schwab data once connected
const mockData: Record<Range, { date: string; portfolio: number; benchmark: number }[]> = {
  "1M": [
    { date: "Apr 6",  portfolio: 0.00, benchmark: 0.00 },
    { date: "Apr 10", portfolio: 0.42, benchmark: 0.61 },
    { date: "Apr 14", portfolio: 0.18, benchmark: 0.83 },
    { date: "Apr 18", portfolio: 0.77, benchmark: 0.54 },
    { date: "Apr 22", portfolio: 1.12, benchmark: 0.91 },
    { date: "Apr 26", portfolio: 0.95, benchmark: 1.14 },
    { date: "Apr 30", portfolio: 1.38, benchmark: 1.03 },
    { date: "May 4",  portfolio: 1.21, benchmark: 0.87 },
    { date: "May 6",  portfolio: 1.55, benchmark: 1.22 },
  ],
  "3M": [
    { date: "Feb",    portfolio: 0.00, benchmark: 0.00 },
    { date: "Mar",    portfolio: 1.18, benchmark: 0.94 },
    { date: "Apr",    portfolio: 0.82, benchmark: 1.41 },
    { date: "May",    portfolio: 2.10, benchmark: 1.78 },
  ],
  "6M": [
    { date: "Nov",    portfolio: 0.00, benchmark: 0.00 },
    { date: "Dec",    portfolio: 0.98, benchmark: 1.52 },
    { date: "Jan",    portfolio: 0.53, benchmark: 2.04 },
    { date: "Feb",    portfolio: 1.77, benchmark: 2.21 },
    { date: "Mar",    portfolio: 2.41, benchmark: 2.83 },
    { date: "Apr",    portfolio: 2.05, benchmark: 3.18 },
    { date: "May",    portfolio: 3.12, benchmark: 2.97 },
  ],
  "1Y": [
    { date: "May '24", portfolio: 0.00, benchmark: 0.00 },
    { date: "Jul '24", portfolio: 2.14, benchmark: 3.02 },
    { date: "Sep '24", portfolio: 3.81, benchmark: 4.23 },
    { date: "Nov '24", portfolio: 4.47, benchmark: 5.14 },
    { date: "Jan '25", portfolio: 3.22, benchmark: 5.76 },
    { date: "Mar '25", portfolio: 5.38, benchmark: 6.01 },
    { date: "May '25", portfolio: 6.21, benchmark: 5.54 },
  ],
  "YTD": [
    { date: "Jan",    portfolio: 0.00, benchmark: 0.00 },
    { date: "Feb",    portfolio: 1.18, benchmark: 0.94 },
    { date: "Mar",    portfolio: 0.82, benchmark: 1.41 },
    { date: "Apr",    portfolio: 2.10, benchmark: 1.78 },
    { date: "May",    portfolio: 2.48, benchmark: 2.03 },
  ],
};

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
          {entry.dataKey === "portfolio" ? "Portfolio" : "S&P 500"}:{" "}
          {entry.value >= 0 ? "+" : ""}
          {entry.value.toFixed(2)}%
        </p>
      ))}
    </div>
  );
}

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("YTD");
  const data = mockData[range];

  return (
    <section className="panel flex flex-col p-4" style={{ height: 300 }}>
      {/* Header row */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="caps-label">Performance</p>
          <h2 className="text-sm font-semibold text-white">Portfolio vs Benchmark</h2>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-[7px] px-2.5 py-1 text-xs font-medium transition-colors ${
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

      {/* Inline legend */}
      <div className="mb-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-0.5 w-3.5 rounded-full bg-[#8e0604]" />
          Portfolio
        </span>
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-0.5 w-3.5 rounded-full bg-zinc-600" />
          S&amp;P 500
        </span>
      </div>

      {/* Chart fills remaining space */}
      <div className="min-h-0 flex-1">
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
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e2329"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#52525b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#52525b", fontSize: 11 }}
              tickFormatter={(v: number) => `${v}%`}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#2a2f37", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="portfolio"
              stroke="#8e0604"
              strokeWidth={2}
              fill="url(#portfolioGrad)"
              dot={false}
              activeDot={{ r: 3, fill: "#8e0604", strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="benchmark"
              stroke="#52525b"
              strokeWidth={1.5}
              fill="url(#benchmarkGrad)"
              dot={false}
              activeDot={{ r: 3, fill: "#71717a", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
