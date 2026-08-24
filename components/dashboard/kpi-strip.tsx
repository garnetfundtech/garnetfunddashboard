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
  fundYtdPct,
}: {
  portfolio: PortfolioSummary | null;
  benchmarkSpark: number[];
  riskStats?: { betaVsSpy: number | null; sharpe30?: number | null; sectorCount: number | null } | null;
  fundYtdPct?: number | null;
}) {
  if (!portfolio) {
    const tiles: { label: string; placeholder: string }[] = [
      { label: "Total AUM", placeholder: "$XX.XXM" },
      { label: "Day P&L", placeholder: "$XX.XXK" },
      { label: "Total P&L", placeholder: "$XX.XXK" },
      { label: "YTD vs Index", placeholder: "XX.X%" },
      { label: "Portfolio Beta", placeholder: "X.XX" },
      { label: "Cash Weight", placeholder: "XX.X%" },
    ];
    return (
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(({ label, placeholder }) => (
          <article key={label} className="panel relative overflow-hidden px-3 py-2.5 opacity-50">
            <p className="caps whitespace-nowrap text-[12px]">{label}</p>
            <p className="stat-value mt-1 text-[19px] text-ink-3">{placeholder}</p>
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
      value: <span className="text-ink">{fmtCompact(aum)}</span>,
      sub: <span className="text-ink-3">{portfolio.positionCount} positions · {fmtCompact(cash)} cash</span>,
      tone: null,
      spark: null,
    },
    {
      label: "Day P&L",
      value: <span className={dayPnl >= 0 ? "text-pos" : "text-neg"}>{fmtSigned(dayPnl)}</span>,
      sub: <span className={dayPnl >= 0 ? "text-pos" : "text-neg"}>{fmtPct(dayPnlPct)}</span>,
      tone: dayPnl >= 0 ? "pos" : "neg",
      spark: benchmarkSpark.slice(-7),
    },
    {
      label: "Total P&L",
      value: <span className={totalPnl >= 0 ? "text-pos" : "text-neg"}>{fmtSigned(totalPnl)}</span>,
      sub: <span className="text-ink-3">open + realized{realized !== 0 ? ` (${fmtSigned(realized)} closed)` : ""}</span>,
      tone: totalPnl >= 0 ? "pos" : "neg",
      spark: benchmarkSpark.slice(-30),
    },
    {
      label: "YTD vs Index",
      value:
        fundYtdPct != null && benchmarkYtd != null ? (
          <span className={fundYtdPct - benchmarkYtd >= 0 ? "text-pos" : "text-neg"}>
            {fmtPct(fundYtdPct - benchmarkYtd, 1)}
          </span>
        ) : (
          <span className="text-ink-3">XX.X%</span>
        ),
      sub:
        fundYtdPct != null && benchmarkYtd != null ? (
          <span className="text-ink-3">
            Us {fmtPct(fundYtdPct, 1)} · S&amp;P {fmtPct(benchmarkYtd, 1)}
          </span>
        ) : (
          <span className="text-ink-3">Fund return vs S&amp;P 500</span>
        ),
      tone: fundYtdPct != null && benchmarkYtd != null ? (fundYtdPct - benchmarkYtd >= 0 ? "pos" : "neg") : null,
      spark: null,
    },
    {
      label: "Portfolio Beta",
      value: <span className="text-ink">{riskStats?.betaVsSpy != null ? riskStats.betaVsSpy.toFixed(2) : "X.XX"}</span>,
      sub: <span className="text-ink-3">{riskStats?.sharpe30 != null ? `Sharpe ${riskStats.sharpe30.toFixed(2)}` : "risk metrics"}</span>,
      tone: null,
      spark: null,
    },
    {
      label: "Cash Weight",
      value: <span className="text-ink">{cashWeightPct.toFixed(1)}%</span>,
      sub: <span className="text-ink-3">{fmtCompact(cash)} available</span>,
      tone: null,
      spark: null,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <article key={t.label} className="panel relative overflow-hidden px-3 py-2.5">
          {t.tone && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{ background: t.tone === "pos" ? "var(--pos)" : "var(--neg)" }}
            />
          )}
          <div className="relative">
            <p className="caps whitespace-nowrap text-[12px]">{t.label}</p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="stat-value whitespace-nowrap text-[19px]">
                {t.value}
              </p>
              {t.spark && t.spark.length >= 2 && (
                <Spark
                  data={t.spark}
                  width={42}
                  height={14}
                  stroke={t.tone === "neg" ? "var(--neg)" : "var(--pos)"}
                  strokeWidth={1.25}
                />
              )}
            </div>
            <p className="num mt-1 whitespace-nowrap text-[12px]">{t.sub}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
