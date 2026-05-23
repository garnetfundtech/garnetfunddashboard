"use client";

import { useEffect, useState } from "react";
import type { Mover } from "@/lib/types";

function MoverRow({ mover, kind }: { mover: Mover | undefined; kind: "up" | "down" }) {
  if (!mover) return null;
  const up = kind === "up";
  const pct = mover.percentChange ?? 0;
  const price = mover.lastPrice ?? 0;
  return (
    <div className="flex items-center justify-between rounded-[6px] px-1.5 py-1 transition-colors hover:bg-white/[0.03]">
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

export function MarketMoversPanel() {
  const [gainers, setGainers] = useState<Mover[]>([]);
  const [losers, setLosers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/schwab/market/movers");
        const json = (await res.json()) as { ok?: boolean; gainers?: Mover[]; losers?: Mover[]; message?: string };
        if (!cancelled) {
          if (json.ok) {
            setGainers(json.gainers ?? []);
            setLosers(json.losers ?? []);
            setError(null);
          } else {
            setError(json.message ?? "Failed to load movers");
          }
        }
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="panel flex flex-col overflow-hidden p-3">
      <div className="mb-1.5 flex shrink-0 items-center justify-between">
        <div>
          <p className="caps text-[10px] text-zinc-500">Market Movers</p>
          <h2 className="whitespace-nowrap text-[13.5px] font-semibold text-white">Gainers · Losers</h2>
        </div>
        <span className="text-[10.5px] text-zinc-500">NYSE+NASDAQ</span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-zinc-500">Loading…</p>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-zinc-500">{error}</p>
        </div>
      ) : gainers.length === 0 && losers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-zinc-500">No mover data available</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-3 overflow-auto">
          <p className="caps text-[9.5px] text-emerald-400/70">Gainers</p>
          <p className="caps text-[9.5px] text-rose-400/70">Losers</p>
          {Array.from({ length: Math.max(gainers.length, losers.length, 4) }).map((_, i) => [
            <MoverRow key={`u${i}`} mover={gainers[i]} kind="up" />,
            <MoverRow key={`d${i}`} mover={losers[i]} kind="down" />,
          ])}
        </div>
      )}
    </section>
  );
}
