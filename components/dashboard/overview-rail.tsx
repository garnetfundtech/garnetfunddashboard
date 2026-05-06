import type { MarketOverview } from "@/lib/types";

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
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
    <aside className="flex flex-col gap-2.5">
      {/* Market status */}
      <section className="panel p-3">
        <p className="caps-label">Market Status</p>
        <div className="mt-2 flex items-center justify-between">
          {market ? (
            sessionBadge(market.session, market.isOpen)
          ) : (
            <span className="text-sm font-semibold text-rose-500">X</span>
          )}
          {market?.sessionEnd && (
            <span className="text-xs text-zinc-500">
              Until {new Date(market.sessionEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        {market?.fetchedAt && (
          <p className="mt-1.5 text-[10px] text-zinc-600">
            Updated {new Date(market.fetchedAt).toLocaleTimeString()}
          </p>
        )}
      </section>

      {/* Index cards — flex-grow so they fill remaining rail height */}
      {market?.indices?.map((idx) => {
        const positive = idx.change >= 0;
        return (
          <section
            key={idx.symbol}
            className={`panel flex flex-1 flex-col justify-center p-3 ${positive ? "glass-stat-positive" : "glass-stat-negative"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="caps-label">{idx.label}</p>
                <p className="text-xs text-zinc-500">{idx.symbol}</p>
              </div>
              <span
                className={`text-xs font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}
              >
                {pct(idx.pctChange)}
              </span>
            </div>
            <p className="mt-1.5 text-lg font-semibold text-white">{usd(idx.lastPrice)}</p>
            <p className={`text-xs ${positive ? "text-emerald-400" : "text-rose-400"}`}>
              {positive ? "▲" : "▼"} {Math.abs(idx.change).toFixed(2)} today
            </p>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
              <span>L {usd(idx.low)}</span>
              <span>H {usd(idx.high)}</span>
            </div>
          </section>
        );
      })}

      {/* Fallback when no market data — show X so it's clear the pull failed */}
      {!market && (
        <>
          {[
            { label: "S&P 500", symbol: "SPY" },
            { label: "Nasdaq 100", symbol: "QQQ" },
            { label: "Russell 2000", symbol: "IWM" },
          ].map(({ label, symbol }) => (
            <section key={symbol} className="panel flex flex-1 flex-col justify-center p-3 opacity-50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="caps-label">{label}</p>
                  <p className="text-xs text-zinc-500">{symbol}</p>
                </div>
              </div>
              <p className="mt-1.5 text-lg font-semibold text-rose-500">X</p>
              <p className="text-xs text-zinc-500">Data unavailable</p>
            </section>
          ))}
        </>
      )}
    </aside>
  );
}
