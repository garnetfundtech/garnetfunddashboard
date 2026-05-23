"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { StatusPill } from "@/components/dashboard/status-pill";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import type { OrderRow } from "@/components/dashboard/orders-table-client";

type StatusFilter = "All" | "Filled" | "Cancelled";

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${n < 0 ? "-" : ""}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${n < 0 ? "-" : ""}$${(abs / 1e3).toFixed(1)}K`;
  return fmtUsd(n);
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusTone(
  status: string,
): "emerald" | "amber" | "blue" | "rose" | "neutral" {
  const s = status.toLowerCase();
  if (s === "filled" || s === "completed") return "emerald";
  if (s === "partial") return "amber";
  if (s === "working" || s === "pending") return "blue";
  if (s === "cancelled" || s === "rejected") return "rose";
  return "neutral";
}

export function OrdersPageClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = "gf_orders_cache";
    const CACHE_TTL = 60_000; // 60 s

    // Show cached data immediately while fetching fresh
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { ts, orders: cached } = JSON.parse(raw) as { ts: number; orders: OrderRow[] };
        if (Date.now() - ts < CACHE_TTL && Array.isArray(cached)) {
          setOrders(cached);
          setLoading(false);
        }
      }
    } catch { /* ignore */ }

    (async () => {
      try {
        const res = await fetch("/api/schwab/orders?days=120");
        const json = (await res.json()) as {
          ok?: boolean;
          orders?: OrderRow[];
          message?: string;
        };
        if (!cancelled) {
          if (!res.ok || !json.ok) setErr(json.message ?? "Failed to load orders");
          else {
            const fresh = json.orders ?? [];
            setErr(null);
            setOrders(fresh);
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), orders: fresh }));
            } catch { /* ignore */ }
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

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(
      (o) => new Date(o.timestamp).toDateString() === today,
    );
  }, [orders]);

  const filledCount = orders.filter(
    (o) => o.status.toLowerCase() === "filled" || o.status.toLowerCase() === "completed",
  ).length;

  const totalNotional = useMemo(
    () =>
      orders.reduce((s, o) => s + o.quantity * o.fillPrice, 0),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = [...orders];
    if (statusFilter !== "All") {
      rows = rows.filter(
        (o) => o.status.toLowerCase() === statusFilter.toLowerCase(),
      );
    }
    if (q) {
      rows = rows.filter((o) =>
        [o.ticker, o.side, o.status, String(o.quantity), o.timestamp]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return rows.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [orders, statusFilter, query]);

  // suppress query — search handled at component level
  void setQuery;

  const kpiTiles = [
    {
      label: "Orders today",
      value: String(todayOrders.length),
      sub: `${filledCount} filled`,
    },
    {
      label: "Volume today",
      value: fmtCompact(totalNotional),
      sub: "Notional traded",
    },
    { label: "Avg slippage", value: "—", sub: "vs arrival price" },
    {
      label: "Fill rate",
      value:
        orders.length > 0
          ? `${Math.round((filledCount / orders.length) * 100)}%`
          : "—",
      sub: "Today's order book",
    },
    { label: "Open orders", value: "—", sub: "Across all dates" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Trading"
        title="Trade History"
        subtitle="Live Schwab orders, fills, and execution history."
        actions={
          <>
            <GhostBtn>
              <Download className="h-3.5 w-3.5" />
              Export
            </GhostBtn>
            <PrimaryBtn>
              <Plus className="h-3.5 w-3.5" />
              New order
            </PrimaryBtn>
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <TableShell
        title="Orders"
        count={filtered.length}
        actions={
          <FilterTabs
            options={["All", "Filled", "Cancelled"] as StatusFilter[]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        }
      >
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-[11.5px] text-zinc-500"
                >
                  Loading orders…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-[11.5px] text-rose-400"
                >
                  {err}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-[11.5px] text-zinc-500"
                >
                  No orders match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr
                  key={o.orderId}
                  className="border-b border-white/[0.025] last:border-b-0 transition hover:bg-white/[0.02]"
                >
                  <td className="px-3 py-2 tabular-nums text-[11.5px] text-zinc-500">
                    #{o.orderId.slice(-6)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-[5px] px-1.5 py-[1px] text-[10.5px] font-bold ${
                        o.side === "BUY"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {o.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[12px] font-semibold text-white">
                    {o.ticker}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px] text-zinc-200">
                    {o.quantity.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px] text-zinc-200">
                    {fmtUsd(o.fillPrice)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      label={o.status}
                      tone={statusTone(o.status)}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">
                    {fmtTime(o.timestamp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
