import { cn } from "@/lib/utils";
import type { PortfolioSummary, MarketSession } from "@/lib/types";

function fmt(n: number, style: "currency" | "percent" | "number" = "currency") {
  if (style === "currency") return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (style === "percent") return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  return n.toFixed(2);
}

function sessionLabel(session: MarketSession): string {
  if (session === "pre") return "Pre-Market";
  if (session === "regular") return "Market Open";
  if (session === "post") return "After Hours";
  return "Market Closed";
}

type Tile = {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  dim?: boolean;
};

function buildTiles(
  portfolio: PortfolioSummary | null,
  session: MarketSession,
  isOpen: boolean,
): Tile[] {
  // When portfolio is null the Schwab API failed — display X so the user knows data is missing
  if (!portfolio) {
    return [
      { label: "Total AUM", value: "X", delta: "Data unavailable", positive: false, dim: true },
      { label: "Cash Position", value: "X", delta: "Data unavailable", positive: false, dim: true },
      { label: "Unrealized P&L", value: "X", delta: "Data unavailable", positive: false, dim: true },
      { label: "Day P&L", value: "X", delta: "Data unavailable", positive: false, dim: true },
      { label: "Market", value: sessionLabel(session), delta: isOpen ? "Trading active" : "Trading halted", positive: isOpen },
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
      delta: `${cashPct.toFixed(1)}% of AUM`,
      positive: cashPct < 100,
    },
    {
      // Unrealized P&L is $0.00 when there are no positions — that IS the correct value
      label: "Unrealized P&L",
      value: fmt(unrealized),
      delta: positions > 0 ? fmt(unrealizedPct, "percent") : "+0.00%",
      positive: unrealized >= 0,
      dim: positions === 0,
    },
    {
      // Day P&L is $0.00 with no positions — correct value, not missing data
      label: "Day P&L",
      value: fmt(dayPnl),
      delta: `${dayPnl >= 0 ? "+" : ""}$${Math.abs(dayPnl).toFixed(2)} today`,
      positive: dayPnl >= 0,
      dim: positions === 0,
    },
    {
      label: "Market",
      value: sessionLabel(session),
      delta: isOpen ? "Trading active" : "Trading halted",
      positive: isOpen,
    },
  ];
}

export function MetricGrid({
  portfolio,
  session = "closed",
  isOpen = false,
}: {
  portfolio: PortfolioSummary | null;
  session?: MarketSession;
  isOpen?: boolean;
}) {
  const tiles = buildTiles(portfolio, session, isOpen);

  return (
    <section className="grid grid-cols-2 gap-2 xl:grid-cols-5">
      {tiles.map((tile) => (
        <article
          key={tile.label}
          className={cn(
            "panel glass-stat p-3",
            tile.dim
              ? "opacity-50"
              : tile.positive
                ? "glass-stat-positive"
                : "glass-stat-negative",
          )}
        >
          <p className="caps-label">{tile.label}</p>
          <p className="mt-1 text-xl font-semibold text-white">{tile.value}</p>
          <p
            className={cn(
              "mt-0.5 text-xs",
              tile.dim
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
