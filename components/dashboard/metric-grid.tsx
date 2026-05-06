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
  delta: string;
  positive: boolean;
  unavailable?: boolean;
};

function buildTiles(portfolio: PortfolioSummary | null): Tile[] {
  if (!portfolio) {
    const x: Tile = { label: "", value: "X", delta: "Data unavailable", positive: false, unavailable: true };
    return [
      { ...x, label: "Total AUM" },
      { ...x, label: "Cash Position" },
      { ...x, label: "Unrealized P&L" },
      { ...x, label: "Day P&L" },
    ];
  }

  const aum = portfolio.liquidationValue;
  const cash = portfolio.cashAvailable;
  const cashPct = aum > 0 ? (cash / aum) * 100 : 0;
  const unrealized = portfolio.unrealizedPnl;
  const unrealizedPct = aum - cash > 0 ? (unrealized / (aum - cash)) * 100 : 0;
  const dayPnl = portfolio.dayPnl;
  const positions = portfolio.positionCount;

  return [
    {
      label: "Total AUM",
      value: fmt(aum),
      delta: `${positions} position${positions !== 1 ? "s" : ""}`,
      positive: true,
    },
    {
      label: "Cash Position",
      value: fmt(cash),
      delta: `${cashPct.toFixed(2)}% of AUM`,
      positive: cashPct < 100,
    },
    {
      label: "Unrealized P&L",
      value: fmt(unrealized),
      delta: positions > 0 ? fmt(unrealizedPct, "percent") : "+0.00%",
      positive: unrealized >= 0,
    },
    {
      label: "Day P&L",
      value: fmt(dayPnl),
      delta: `${dayPnl >= 0 ? "+" : ""}$${Math.abs(dayPnl).toFixed(2)} today`,
      positive: dayPnl >= 0,
    },
  ];
}

export function MetricGrid({ portfolio }: { portfolio: PortfolioSummary | null }) {
  const tiles = buildTiles(portfolio);

  return (
    <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
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
          <p className="mt-1 text-xl font-semibold tabular-nums text-white">{tile.value}</p>
          <p
            className={cn(
              "mt-0.5 text-xs tabular-nums",
              tile.unavailable
                ? "text-zinc-500"
                : tile.positive
                  ? "text-emerald-400"
                  : "text-rose-400",
            )}
          >
            {tile.delta}
          </p>
        </article>
      ))}
    </section>
  );
}
