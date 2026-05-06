import type { Mover } from "@/lib/types";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MoverRow({ mover }: { mover: Mover }) {
  const pct = mover.percentChange ?? 0;
  const price = mover.lastPrice ?? 0;
  const change = mover.change ?? 0;
  const isUp = change >= 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 hover:bg-white/[0.03] transition-colors">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white">{mover.symbol ?? "—"}</p>
        <p className="truncate text-[10px] text-zinc-500">{mover.description ?? ""}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-white">{fmtUsd(price)}</p>
        <p className={`text-[10px] font-medium ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
          {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({isUp ? "+" : ""}{pct.toFixed(2)}%)
        </p>
      </div>
    </div>
  );
}

function MoverColumn({
  title,
  movers,
  emptyMessage,
}: {
  title: string;
  movers: Mover[];
  emptyMessage: string;
}) {
  return (
    <div className="panel p-3">
      <p className="caps-label mb-2">{title}</p>
      {movers.length === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-500">{emptyMessage}</p>
      ) : (
        <div className="space-y-0.5">
          {movers.map((m, i) => (
            <MoverRow key={m.symbol ?? i} mover={m} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MarketMoversPanel({
  gainers,
  losers,
}: {
  gainers: Mover[];
  losers: Mover[];
}) {
  const hasData = gainers.length > 0 || losers.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="caps-label">Market Movers</p>
          <h2 className="text-sm font-semibold text-white">S&P 500 — Top Gainers &amp; Losers</h2>
        </div>
        {!hasData && (
          <span className="text-xs text-zinc-500">Live data unavailable</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MoverColumn
          title="Top Gainers"
          movers={gainers}
          emptyMessage="No gainers today"
        />
        <MoverColumn
          title="Top Losers"
          movers={losers}
          emptyMessage="No declines today — market broadly up"
        />
      </div>
    </div>
  );
}
