"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { performanceSeries } from "@/lib/mock-data";

export function PerformanceChart() {
  return (
    <section className="panel h-[310px] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="caps-label">Performance</p>
          <h2 className="text-base font-semibold text-white">Portfolio vs Benchmark</h2>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          {["1M", "3M", "6M", "1Y", "YTD"].map((range) => (
            <button
              key={range}
              className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-zinc-800"
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height="86%">
        <LineChart data={performanceSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="#252a31" />
          <XAxis dataKey="date" stroke="#8e95a3" />
          <YAxis stroke="#8e95a3" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#101316",
              border: "1px solid #2a2f37",
              borderRadius: 10,
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke="#8e0604"
            strokeWidth={3}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="#c8ccd4"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
