import type { LivePosition } from "@/lib/types";

export function RiskPanel({
  betaVsSpy,
  sharpe30,
  sharpe90,
  sectorCount,
  positions,
}: {
  betaVsSpy: number | null;
  sharpe30?: number | null;
  sharpe90?: number | null;
  sectorCount: number | null;
  positions: LivePosition[];
}) {
  const positionCount = positions.length;

  // top-3 concentration by weight
  const sortedByWeight = [...positions].sort((a, b) => b.weight - a.weight);
  const top3Weight = sortedByWeight.slice(0, 3).reduce((s, p) => s + p.weight, 0);

  const items: {
    key: string;
    sub: string;
    value: string;
    tone: "good" | "bad" | "warn" | null;
  }[] = [
    {
      key: "Beta (vs SPY)",
      sub: betaVsSpy != null ? (betaVsSpy > 1 ? "above market" : "below market") : "unavailable",
      value: betaVsSpy != null && Number.isFinite(betaVsSpy) ? betaVsSpy.toFixed(2) : "—",
      tone: betaVsSpy != null && betaVsSpy > 1.2 ? "warn" : null,
    },
    {
      key: "Sharpe (30D)",
      sub: sharpe30 != null ? (sharpe30 > 1 ? "strong risk-adj return" : "risk-adj return") : "insufficient data",
      value: sharpe30 != null && Number.isFinite(sharpe30) ? sharpe30.toFixed(2) : "—",
      tone: sharpe30 != null && sharpe30 > 1 ? "good" : null,
    },
    {
      key: "Sharpe (90D)",
      sub: sharpe90 != null ? (sharpe90 > 1 ? "strong risk-adj return" : "risk-adj return") : "insufficient data",
      value: sharpe90 != null && Number.isFinite(sharpe90) ? sharpe90.toFixed(2) : "—",
      tone: sharpe90 != null && sharpe90 > 1 ? "good" : null,
    },
    {
      key: "Sector Count",
      sub: "of 11 GICS",
      value: sectorCount != null ? String(sectorCount) : "XX",
      tone: null,
    },
    {
      key: "Positions",
      sub: "holdings",
      value: String(positionCount),
      tone: null,
    },
    {
      key: "Top-3 Weight",
      sub: "concentration",
      value: positionCount >= 3 ? `${top3Weight.toFixed(0)}%` : "—",
      tone: top3Weight > 50 ? "warn" : null,
    },
  ];

  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="caps text-[11px] text-ink-3">Risk Profile</p>
      </div>
      <div className="flex flex-1 flex-col justify-between">
        {items.map((it, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between border-b border-line py-[3px] last:border-b-0"
          >
            <div>
              <p className="text-[13px] leading-tight text-ink">{it.key}</p>
              <p className="text-[12px] uppercase leading-tight tracking-wider text-ink-3">{it.sub}</p>
            </div>
            <p
              className={`text-[15px] font-semibold tabular-nums ${
                it.tone === "good" ? "text-pos" :
                it.tone === "bad"  ? "text-neg" :
                it.tone === "warn" ? "text-warn" :
                "text-ink"
              }`}
            >
              {it.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
