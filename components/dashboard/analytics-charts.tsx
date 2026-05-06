"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioRiskStats } from "@/lib/compute-portfolio-risk-stats";
import type { LivePosition } from "@/lib/types";

const COLORS = ["#8e0604", "#b91c1c", "#dc2626", "#f87171", "#64748b", "#71717a", "#a1a1aa"];

export function AnalyticsCharts({
  sectorData,
  concData,
  stats,
  top,
  bottom,
}: {
  sectorData: { name: string; value: number }[];
  concData: { name: string; weight: number }[];
  stats: PortfolioRiskStats | null;
  top: LivePosition | null;
  bottom: LivePosition | null;
}) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel p-4">
          <p className="caps-label">Allocation</p>
          <h2 className="text-sm font-semibold text-white">Sector mix</h2>
          <div className="mt-2 h-[260px]">
            {sectorData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {sectorData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0c0d0f", border: "1px solid #27272a", borderRadius: 8 }}
                    labelStyle={{ color: "#e4e4e7" }}
                    formatter={(v) => [`${Number(v)}%`, "Weight"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-4 text-xs text-zinc-500">No sector data available yet.</p>
            )}
          </div>
        </section>

        <section className="panel p-4">
          <p className="caps-label">Concentration</p>
          <h2 className="text-sm font-semibold text-white">% of portfolio by holding</h2>
          <div className="mt-2 h-[260px]">
            {concData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={concData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2329" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} unit="%" domain={[0, "auto"]} />
                  <YAxis type="category" dataKey="name" width={48} tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#0c0d0f", border: "1px solid #27272a", borderRadius: 8 }}
                    formatter={(v) => [`${Number(v)}%`, "Weight"]}
                  />
                  <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
                    {concData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-4 text-xs text-zinc-500">No position data available yet.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="panel p-4">
          <p className="caps-label">Risk</p>
          <h2 className="text-sm font-semibold text-white">Beta vs SPY</h2>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-white">
            {stats?.betaVsSpy != null ? stats.betaVsSpy.toFixed(2) : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Weighted estimate from daily returns</p>
        </section>
        <section className="panel p-4">
          <p className="caps-label">Quality</p>
          <h2 className="text-sm font-semibold text-white">Rolling Sharpe</h2>
          <p className="mt-2 text-xs text-zinc-400">
            30d:{" "}
            <span className="font-semibold text-white">
              {stats?.sharpe30 != null ? stats.sharpe30.toFixed(2) : "—"}
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            90d:{" "}
            <span className="font-semibold text-white">
              {stats?.sharpe90 != null ? stats.sharpe90.toFixed(2) : "—"}
            </span>
          </p>
        </section>
        <section className="panel p-4">
          <p className="caps-label">Attribution</p>
          <h2 className="text-sm font-semibold text-white">P&amp;L leaders</h2>
          {top ? (
            <p className="mt-2 text-xs text-emerald-400">
              Top: {top.ticker} ({top.unrealizedPnl >= 0 ? "+" : ""}
              {top.unrealizedPnl.toLocaleString("en-US", { style: "currency", currency: "USD" })})
            </p>
          ) : null}
          {bottom ? (
            <p className="mt-1 text-xs text-rose-400">
              Lag: {bottom.ticker} ({bottom.unrealizedPnl >= 0 ? "+" : ""}
              {bottom.unrealizedPnl.toLocaleString("en-US", { style: "currency", currency: "USD" })})
            </p>
          ) : null}
          {!top && !bottom && (
            <p className="mt-2 text-xs text-zinc-500">No P&amp;L data yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
