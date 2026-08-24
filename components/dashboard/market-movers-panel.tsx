"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { Mover } from "@/lib/types";

function MoverRow({ mover, kind }: { mover: Mover | undefined; kind: "up" | "down" }) {
  if (!mover) return null;
  const up = kind === "up";
  const pct = mover.percentChange ?? 0;
  const price = mover.lastPrice ?? 0;
  return (
    <div className="flex items-center justify-between rounded-none px-1.5 py-1 transition-colors hover:bg-paper-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{mover.symbol ?? "—"}</p>
        <p className="truncate text-[12px] text-ink-3">{mover.description ?? ""}</p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className="text-[12px] text-ink">${price.toFixed(2)}</p>
        <p className={`flex items-center justify-end gap-0.5 text-[11px] font-medium ${up ? "text-pos" : "text-neg"}`}>
          {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
          {Math.abs(pct).toFixed(2)}%
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
          <p className="caps text-[11px] text-ink-3">Market Movers</p>
          <h2 className="whitespace-nowrap text-[15px] font-semibold text-ink">Gainers · Losers</h2>
        </div>
        <span className="text-[12px] text-ink-3">NYSE+NASDAQ</span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[12.5px] text-ink-3">Loading…</p>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[12.5px] text-ink-3">{error}</p>
        </div>
      ) : gainers.length === 0 && losers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[12.5px] text-ink-3">No mover data available</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-3 overflow-auto">
          <p className="caps text-[12px] text-pos">Gainers</p>
          <p className="caps text-[12px] text-neg">Losers</p>
          {Array.from({ length: Math.max(gainers.length, losers.length, 4) }).map((_, i) => [
            <MoverRow key={`u${i}`} mover={gainers[i]} kind="up" />,
            <MoverRow key={`d${i}`} mover={losers[i]} kind="down" />,
          ])}
        </div>
      )}
    </section>
  );
}
