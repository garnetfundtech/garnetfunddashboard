import type { MarketOverview } from "@/lib/types";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function OverviewRail({ market }: { market: MarketOverview | null }) {
  return (
    <aside className="flex h-full flex-col gap-2">
      {market?.indices?.map((idx) => {
        const positive = idx.change >= 0;
        return (
          <section
            key={idx.symbol}
            className="panel relative flex flex-1 flex-col justify-center overflow-hidden p-2.5"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: positive
                  ? "linear-gradient(to top, rgba(52,211,153,0.05), transparent 70%)"
                  : "linear-gradient(to top, rgba(251,113,133,0.05), transparent 70%)",
              }}
            />
            <div className="relative">
              <p className="caps text-[9.5px] text-zinc-500">
                {idx.label} <span className="text-zinc-600">({idx.symbol})</span>
              </p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-white">
                {fmtUsd(idx.lastPrice)}
              </p>
              <p className={`mt-0.5 text-[11px] tabular-nums font-medium ${positive ? "text-emerald-400" : "text-rose-400"}`}>
                {positive ? "▲" : "▼"} {Math.abs(idx.change).toFixed(2)} ({fmtPct(idx.pctChange)})
              </p>
            </div>
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
            <section key={symbol} className="panel flex flex-1 flex-col justify-center p-2.5 opacity-40">
              <p className="caps text-[9.5px] text-zinc-500">
                {label} <span className="text-zinc-600">({symbol})</span>
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-zinc-500">—</p>
            </section>
          ))}
        </>
      )}
    </aside>
  );
}
