import { cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/lib/types";

function fmt(n: number, style: "currency" | "percent" = "currency") {
  if (style === "currency")
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

type Tile = {
  label: string;
  value: string;
  delta: string | null;
  positive: boolean;
  unavailable?: boolean;
};

function buildTiles(
  portfolio: PortfolioSummary | null,
  risk?: { betaVsSpy: number | null; sectorCount: number | null } | null,
): Tile[] {
  if (!portfolio) {
    const x: Tile = { label: "", value: "X", delta: null, positive: false, unavailable: true };
    return [
      { ...x, label: "Total AUM" },
      { ...x, label: "Unrealized P&L" },
      { ...x, label: "Day P&L" },
      { ...x, label: "Portfolio Beta" },
      { ...x, label: "Sectors" },
    ];
  }

  const aum = portfolio.liquidationValue;
  const cash = portfolio.cashAvailable;
  const unrealized = portfolio.unrealizedPnl;
  const unrealizedPct = aum - cash > 0 ? (unrealized / (aum - cash)) * 100 : 0;
  const dayPnl = portfolio.dayPnl;
  const dayPnlPct = aum - cash > 0 ? (dayPnl / (aum - cash)) * 100 : 0;
  const positions = portfolio.positionCount;

  const base: Tile[] = [
    {
      label: "Total AUM",
      value: fmt(aum),
      delta: String(positions),
      positive: true,
    },
    {
      label: "Unrealized P&L",
      value: fmt(unrealized),
      delta: positions > 0 ? fmt(unrealizedPct, "percent") : null,
      positive: unrealized >= 0,
    },
    {
      label: "Day P&L",
      value: fmt(dayPnl),
      delta: positions > 0 ? fmt(dayPnlPct, "percent") : null,
      positive: dayPnl >= 0,
    },
  ];

  const beta = risk?.betaVsSpy;
  const sectors = risk?.sectorCount;

  base.push({
    label: "Portfolio Beta (vs SPY)",
    value: beta != null && Number.isFinite(beta) ? beta.toFixed(2) : "—",
    delta: null,
    positive: beta == null || beta <= 1.25,
  });

  base.push({
    label: "Sector count",
    value: sectors != null ? String(sectors) : "—",
    delta: null,
    positive: true,
  });

  return base;
}

export function MetricGrid({
  portfolio,
  riskStats,
}: {
  portfolio: PortfolioSummary | null;
  riskStats?: { betaVsSpy: number | null; sectorCount: number | null } | null;
}) {
  const tiles = buildTiles(portfolio, riskStats ?? null);

  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <article
          key={tile.label}
          className={cn(
            "panel glass-stat p-3",
            tile.unavailable
              ? "opacity-40"
              : tile.positive
                ? "glass-stat-positive"
                : "glass-stat-negative",
          )}
        >
          <p className="caps-label">{tile.label}</p>
          <p
            className={cn(
              "mt-1.5 text-base font-semibold tabular-nums",
              tile.unavailable ? "text-zinc-500" : "text-white",
            )}
          >
            {tile.value}
            {tile.delta ? (
              <span className="ml-1.5 font-medium text-zinc-500">({tile.delta})</span>
            ) : null}
          </p>
        </article>
      ))}
    </section>
  );
}
