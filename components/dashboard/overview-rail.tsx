import type { MarketOverview } from "@/lib/types";

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function signedUsd(n: number) {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function sessionBadge(session: string, isOpen: boolean) {
  const labels: Record<string, string> = {
    regular: "Regular",
    pre: "Pre-Market",
    post: "After Hours",
    closed: "Closed",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        isOpen ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`}
      />
      {labels[session] ?? session}
    </span>
  );
}

export function OverviewRail({ market }: { market: MarketOverview | null }) {
  return (
    <aside className="flex h-full flex-col gap-2.5">
      {/* Market status */}
      <section className="panel p-3">
        <p className="caps-label">Market Status</p>
        <div className="mt-1.5 flex items-center justify-between">
          {market ? (
            sessionBadge(market.session, market.isOpen)
          ) : (
            <span className="text-sm font-semibold text-rose-500">X</span>
          )}
          {market?.fetchedAt && (
            <span className="text-[10px] text-zinc-500">
              Updated {new Date(market.fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </section>

      {/* Index cards — flex-1 to fill remaining rail height */}
      {market?.indices?.map((idx) => {
        const positive = idx.change >= 0;
        return (
          <section
            key={idx.symbol}
            className={`panel flex flex-1 flex-col justify-center p-3 ${positive ? "glass-stat-positive" : "glass-stat-negative"}`}
          >
            <p className="caps-label">
              {idx.label} <span className="text-zinc-500">({idx.symbol})</span>
            </p>
            <p className="mt-1.5 text-base font-semibold tabular-nums text-white">
              {usd(idx.lastPrice)}{" "}
              <span
                className={`ml-1 text-sm font-medium ${positive ? "text-emerald-400" : "text-rose-400"}`}
              >
                ({pct(idx.pctChange)}, {signedUsd(idx.change)})
              </span>
            </p>
          </section>
        );
      })}

      {/* Fallback when no market data */}
      {!market && (
        <>
          {[
            { label: "S&P 500", symbol: "SPY" },
            { label: "Nasdaq 100", symbol: "QQQ" },
            { label: "Russell 2000", symbol: "IWM" },
          ].map(({ label, symbol }) => (
            <section key={symbol} className="panel flex flex-1 flex-col justify-center p-3 opacity-40">
              <p className="caps-label">
                {label} <span className="text-zinc-500">({symbol})</span>
              </p>
              <p className="mt-1.5 text-base font-semibold text-zinc-500">X</p>
            </section>
          ))}
        </>
      )}
    </aside>
  );
}
