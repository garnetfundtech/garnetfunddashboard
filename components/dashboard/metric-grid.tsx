import { cn } from "@/lib/utils";
import type { PortfolioSummary, MarketOverview } from "@/lib/types";

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
    const x: Tile = { label: "", value: "—", delta: null, positive: false, unavailable: true };
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
  const unrealizedPct = aum > 0 ? (unrealized / aum) * 100 : 0;
  const dayPnl = portfolio.dayPnl;
  const dayPnlPct = aum > 0 ? (dayPnl / aum) * 100 : 0;
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
    label: "Portfolio Beta",
    value: beta != null && Number.isFinite(beta) ? beta.toFixed(2) : "—",
    delta: null,
    positive: beta == null || beta <= 1.25,
  });

  base.push({
    label: "Sector Count",
    value: sectors != null ? String(sectors) : "—",
    delta: null,
    positive: true,
  });

  return base;
}

function sessionLabel(session: string) {
  const map: Record<string, string> = {
    regular: "Regular",
    pre: "Pre-Market",
    post: "After Hours",
    closed: "Closed",
  };
  return map[session] ?? session;
}

export function MetricGrid({
  portfolio,
  riskStats,
  market,
}: {
  portfolio: PortfolioSummary | null;
  riskStats?: { betaVsSpy: number | null; sectorCount: number | null } | null;
  market?: MarketOverview | null;
}) {
  const tiles = buildTiles(portfolio, riskStats ?? null);

  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
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

      {/* Market status tile — 6th slot */}
      <article
        className={cn(
          "panel glass-stat p-3",
          market ? (market.isOpen ? "glass-stat-positive" : "") : "opacity-40",
        )}
      >
        <p className="caps-label">Market Status</p>
        {market ? (
          <>
            <p className="mt-1.5 text-base font-semibold text-white">
              {sessionLabel(market.session)}
            </p>
            {market.fetchedAt && (
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {new Date(market.fetchedAt).toLocaleTimeString()}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-base font-semibold text-zinc-500">—</p>
        )}
      </article>
    </section>
  );
}
