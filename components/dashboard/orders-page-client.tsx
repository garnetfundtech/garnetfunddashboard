"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { StatusPill } from "@/components/dashboard/status-pill";
import { GhostBtn } from "@/components/dashboard/buttons";
import { downloadCsv } from "@/lib/csv-client";
import type { OrderRow } from "@/components/dashboard/orders-table-client";

type StatusFilter = "All" | "Filled" | "Cancelled";

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "$XX.XX";
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
  const [syncing, setSyncing] = useState(false);

  async function loadOrders() {
    try {
      const res = await fetch("/api/schwab/orders?days=120");
      const json = (await res.json()) as { ok?: boolean; orders?: OrderRow[]; message?: string };
      if (!res.ok || !json.ok) {
        setErr(json.message ?? "Failed to load orders");
        return;
      }
      setErr(null);
      setOrders(json.orders ?? []);
      try {
        sessionStorage.setItem("gf_orders_cache", JSON.stringify({ ts: Date.now(), orders: json.orders ?? [] }));
      } catch { /* ignore */ }
    } catch {
      setErr("Network error");
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await fetch("/api/schwab/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 120 }),
      });
      await loadOrders();
    } finally {
      setSyncing(false);
    }
  }

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

    loadOrders().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadOrders is stable for the component's lifetime
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

  function exportCsv() {
    downloadCsv(
      ["Order ID", "Side", "Ticker", "Quantity", "Fill Price", "Status", "Time"],
      filtered.map((o) => [o.orderId, o.side, o.ticker, o.quantity, o.fillPrice, o.status, o.timestamp]),
      "garnet-fund-trade-history.csv",
    );
  }

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
    { label: "Avg slippage", value: "XX.XX%", sub: "vs arrival price" },
    {
      label: "Fill rate",
      value:
        orders.length > 0
          ? `${Math.round((filledCount / orders.length) * 100)}%`
          : "XX%",
      sub: "Today's order book",
    },
    { label: "Open orders", value: "XX", sub: "Across all dates" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Trade History"
        meta={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
        actions={
          <>
            <GhostBtn onClick={() => void syncNow()} disabled={syncing}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing" : "Sync now"}
            </GhostBtn>
            <GhostBtn onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" />
              Export
            </GhostBtn>
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
            <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
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
                  className="px-3 py-12 text-center text-[13.5px] text-ink-3"
                >
                  Loading orders…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-[13.5px] text-neg"
                >
                  {err}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-[13.5px] text-ink-3"
                >
                  No orders match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr
                  key={o.orderId}
                  className="border-b border-line last:border-b-0 transition hover:bg-paper-3"
                >
                  <td className="px-3 py-2 tabular-nums text-[13.5px] text-ink-3">
                    #{o.orderId.slice(-6)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-none px-1.5 py-[1px] text-[12px] font-bold ${
                        o.side === "BUY"
                          ? "bg-pos-soft text-pos"
                          : "bg-neg-soft text-neg"
                      }`}
                    >
                      {o.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[14px] font-semibold text-ink">
                    {o.ticker}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[14px] text-ink">
                    {o.quantity.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[14px] text-ink">
                    {fmtUsd(o.fillPrice)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      label={o.status}
                      tone={statusTone(o.status)}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">
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
