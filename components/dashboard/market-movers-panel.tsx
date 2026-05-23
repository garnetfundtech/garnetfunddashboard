import type { Mover } from "@/lib/types";

function MoverRow({ mover, kind }: { mover: Mover | undefined; kind: "up" | "down" }) {
  if (!mover) return <div className="h-10" />;
  const up = kind === "up";
  const pct = mover.percentChange ?? 0;
  const price = mover.lastPrice ?? 0;
  return (
    <div className="flex items-center justify-between rounded-[6px] px-1.5 py-1 hover:bg-white/[0.03] transition-colors">
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-white">{mover.symbol ?? "—"}</p>
        <p className="truncate text-[9.5px] text-zinc-500">{mover.description ?? ""}</p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className="text-[10.5px] text-zinc-300">${price.toFixed(2)}</p>
        <p className={`text-[10px] font-medium ${up ? "text-emerald-400" : "text-rose-400"}`}>
          {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
        </p>
      </div>
    </div>
  );
}

export function MarketMoversPanel({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div>
          <p className="caps text-[10px] text-zinc-500">Market Movers</p>
          <h2 className="whitespace-nowrap text-[13.5px] font-semibold text-white">Gainers · Losers</h2>
        </div>
        <span className="text-[10.5px] text-zinc-500">NYSE+NASDAQ</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-[3px]">
        <p className="caps text-[9.5px] text-emerald-400/70">Gainers</p>
        <p className="caps text-[9.5px] text-rose-400/70">Losers</p>
        {Array.from({ length: 4 }).map((_, i) => [
          <MoverRow key={`u${i}`} mover={gainers[i]} kind="up" />,
          <MoverRow key={`d${i}`} mover={losers[i]} kind="down" />,
        ])}
      </div>
    </section>
  );
}
