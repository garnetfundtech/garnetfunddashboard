import { ArrowUp, ArrowDown } from "lucide-react";
import type { MarketOverview } from "@/lib/types";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function OverviewRail({ market }: { market: MarketOverview | null }) {
  return (
    <aside className="flex h-full flex-col gap-3">
      {market?.indices?.map((idx) => {
        const positive = idx.change >= 0;
        return (
          <section
            key={idx.symbol}
            className="panel flex flex-1 flex-col justify-center overflow-hidden p-2.5"
          >
            <p className="caps">
              {idx.label} <span className="text-ink-3">({idx.symbol})</span>
            </p>
            <p className="stat-value mt-1 text-[19px] text-ink">
              {fmtUsd(idx.lastPrice)}
            </p>
            <p className={`num mt-1 flex items-center gap-0.5 text-[13px] font-medium ${positive ? "text-pos" : "text-neg"}`}>
              {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(idx.change).toFixed(2)} ({fmtPct(idx.pctChange)})
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
            <section key={symbol} className="panel flex flex-1 flex-col justify-center p-2.5 opacity-50">
              <p className="caps">
                {label} <span className="text-ink-3">({symbol})</span>
              </p>
              <p className="stat-value mt-1 text-[19px] text-ink-3">—</p>
            </section>
          ))}
        </>
      )}
    </aside>
  );
}
