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

export function OverviewRail({ market }: { market: MarketOverview | null }) {
  return (
    <aside className="flex h-full flex-col gap-2.5">
      {market?.indices?.map((idx) => {
        const positive = idx.change >= 0;
        return (
          <section
            key={idx.symbol}
            className={`panel flex flex-1 flex-col justify-center p-3 ${positive ? "glass-stat glass-stat-positive" : "glass-stat glass-stat-negative"}`}
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
              <p className="mt-1.5 text-base font-semibold text-zinc-500">—</p>
            </section>
          ))}
        </>
      )}
    </aside>
  );
}
