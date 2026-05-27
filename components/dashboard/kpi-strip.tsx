import { Spark } from "@/components/dashboard/spark";
import type { PortfolioSummary } from "@/lib/types";

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${n < 0 ? "-" : ""}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${n < 0 ? "-" : ""}$${(abs / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtSigned(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtCompact(Math.abs(n))}`;
}

function fmtPct(n: number, d = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}

export function KpiStrip({
  portfolio,
  benchmarkSpark,
  riskStats,
}: {
  portfolio: PortfolioSummary | null;
  benchmarkSpark: number[];
  riskStats?: { betaVsSpy: number | null; sharpe30?: number | null; sectorCount: number | null } | null;
}) {
  if (!portfolio) {
    const tiles = [
      "Total AUM",
      "Day P&L",
      "Total P&L",
      "YTD vs Index",
      "Portfolio Beta",
      "Cash Weight",
    ];
    return (
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((label) => (
          <article key={label} className="panel relative overflow-hidden px-2.5 py-2 opacity-40">
            <p className="caps text-[9.5px] whitespace-nowrap text-zinc-500">{label}</p>
            <p className="mt-0.5 text-[15px] font-semibold text-zinc-500">—</p>
          </article>
        ))}
      </section>
    );
  }

  const aum = portfolio.liquidationValue;
  const cash = portfolio.cashAvailable;
  const dayPnl = portfolio.dayPnl;
  const dayPnlPct = aum > 0 ? (dayPnl / aum) * 100 : 0;
  const unrealized = portfolio.unrealizedPnl;
  const realized = portfolio.realizedPnl ?? 0;
  const totalPnl = unrealized + realized;
  const totalPnlPct = aum > 0 ? (totalPnl / aum) * 100 : 0;
  const cashWeightPct = aum > 0 ? (cash / aum) * 100 : 0;
  const benchmarkYtd = benchmarkSpark.length > 0 ? (benchmarkSpark[benchmarkSpark.length - 1] ?? 0) : null;

  const tiles: {
    label: string;
    value: React.ReactNode;
    sub: React.ReactNode;
    tone: "pos" | "neg" | null;
    spark: number[] | null;
  }[] = [
    {
      label: "Total AUM",
      value: <span className="text-white">{fmtCompact(aum)}</span>,
      sub: <span className="text-zinc-500">{portfolio.positionCount} positions · {fmtCompact(cash)} cash</span>,
      tone: null,
      spark: null,
    },
    {
      label: "Day P&L",
      value: <span className={dayPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtSigned(dayPnl)}</span>,
      sub: <span className={dayPnl >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}>{fmtPct(dayPnlPct)}</span>,
      tone: dayPnl >= 0 ? "pos" : "neg",
      spark: benchmarkSpark.slice(-7),
    },
    {
      label: "Total P&L",
      value: <span className={totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtSigned(totalPnl)}</span>,
      sub: <span className="text-zinc-500">open + realized{realized !== 0 ? ` (${fmtSigned(realized)} closed)` : ""}</span>,
      tone: totalPnl >= 0 ? "pos" : "neg",
      spark: benchmarkSpark.slice(-30),
    },
    {
      label: "YTD vs Index",
      value: <span className={benchmarkYtd != null && benchmarkYtd >= 0 ? "text-white" : "text-rose-400"}>{benchmarkYtd != null ? fmtPct(benchmarkYtd, 1) : "—"}</span>,
      sub: <span className="text-zinc-500">S&amp;P 500 (YTD)</span>,
      tone: benchmarkYtd != null ? (benchmarkYtd >= 0 ? "pos" : "neg") : null,
      spark: benchmarkSpark.length > 2 ? benchmarkSpark : null,
    },
    {
      label: "Portfolio Beta",
      value: <span className="text-white">{riskStats?.betaVsSpy != null ? riskStats.betaVsSpy.toFixed(2) : "—"}</span>,
      sub: <span className="text-zinc-500">{riskStats?.sharpe30 != null ? `Sharpe ${riskStats.sharpe30.toFixed(2)}` : "risk metrics"}</span>,
      tone: null,
      spark: null,
    },
    {
      label: "Cash Weight",
      value: <span className="text-white">{cashWeightPct.toFixed(1)}%</span>,
      sub: <span className="text-zinc-500">{fmtCompact(cash)} available</span>,
      tone: null,
      spark: null,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <article key={t.label} className="panel relative overflow-hidden px-2.5 py-2">
          {t.tone && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(to top, ${t.tone === "pos" ? "rgba(52,211,153,0.06)" : "rgba(251,113,133,0.06)"}, transparent 60%)`,
              }}
            />
          )}
          <div className="relative">
            <p className="caps text-[9.5px] whitespace-nowrap text-zinc-500">{t.label}</p>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold tabular-nums leading-tight whitespace-nowrap">
                {t.value}
              </p>
              {t.spark && t.spark.length >= 2 && (
                <Spark
                  data={t.spark}
                  width={42}
                  height={14}
                  stroke={t.tone === "neg" ? "#fb7185" : "#34d399"}
                  strokeWidth={1.25}
                />
              )}
            </div>
            <p className="mt-0.5 whitespace-nowrap text-[10.5px] tabular-nums">{t.sub}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
