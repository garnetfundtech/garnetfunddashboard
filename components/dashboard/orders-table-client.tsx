"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Highlight } from "@/components/dashboard/highlight";
import { StatusPill } from "@/components/dashboard/status-pill";

export type OrderRow = {
  orderId: string;
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  fillPrice: number;
  status: string;
  timestamp: string;
};

type SortKey = "ticker" | "side" | "quantity" | "fillPrice" | "status" | "timestamp";

export function OrdersTableClient({
  query,
  from,
  to,
}: {
  query: string;
  from: string;
  to: string;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/schwab/orders?days=120");
        const json = (await res.json()) as { ok?: boolean; orders?: OrderRow[]; message?: string };
        if (!cancelled) {
          if (!res.ok || !json.ok) setErr(json.message ?? "Failed to load orders");
          else {
            setErr(null);
            setOrders(json.orders ?? []);
          }
        }
      } catch {
        if (!cancelled) setErr("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let rows = [...orders];
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.ticker,
          r.side,
          r.status,
          String(r.quantity),
          r.timestamp,
          new Date(r.timestamp).toLocaleDateString("en-US"),
          new Date(r.timestamp).toLocaleString("en-US"),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (from) {
      const f = new Date(from).getTime();
      rows = rows.filter((r) => new Date(r.timestamp).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime() + 86400000;
      rows = rows.filter((r) => new Date(r.timestamp).getTime() < t);
    }
    // Default ordering (standard): newest → oldest
    rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (sort) {
      const mul = sort.dir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (sort.key === "quantity" || sort.key === "fillPrice") {
          return (Number(av) - Number(bv)) * mul;
        }
        if (sort.key === "timestamp") {
          return (new Date(String(av)).getTime() - new Date(String(bv)).getTime()) * mul;
        }
        return String(av).localeCompare(String(bv)) * mul;
      });
    }
    return rows;
  }, [orders, from, to, query, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "desc" };
      if (s.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  return (
    <div className="space-y-3">
      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-paper-2 text-ink-2">
              <tr>
                {(
                  [
                    ["ticker", "Ticker"],
                    ["side", "Side"],
                    ["quantity", "Qty"],
                    ["fillPrice", "Fill"],
                    ["status", "Status"],
                    ["timestamp", "Time"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-ink",
                        sort?.key === key && "text-ink",
                      )}
                    >
                      {label}
                      {sort?.key === key ? (
                        sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-ink-3">
                    Loading orders…
                  </td>
                </tr>
              ) : err ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-neg">
                    {err}
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-ink-3">
                    No orders placed at this time.
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-ink-3">
                    No orders found in the selected date range.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.orderId} className="odd:bg-paper-3 text-ink">
                    <td className="px-3 py-2 font-semibold text-ink">
                      <Highlight text={r.ticker} query={query} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill
                        label={<Highlight text={r.side} query={query} />}
                        tone={r.side === "BUY" ? "emerald" : "rose"}
                        dot={false}
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <Highlight text={r.quantity.toLocaleString()} query={query} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <Highlight
                        text={r.fillPrice.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        query={query}
                      />
                    </td>
                    <td className="px-3 py-2 text-ink-2">
                      <Highlight text={r.status} query={query} />
                    </td>
                    <td className="px-3 py-2 text-ink-2">
                      {r.timestamp ? <Highlight text={new Date(r.timestamp).toLocaleString()} query={query} /> : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
