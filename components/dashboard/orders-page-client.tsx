"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { StatusPill } from "@/components/dashboard/status-pill";
import { GhostBtn } from "@/components/dashboard/buttons";
import { downloadXlsx } from "@/lib/xlsx-client";
import type { OrderRow } from "@/components/dashboard/orders-table-client";

const WINDOW_DAYS = 365;

type StatusFilter = "All" | "Filled" | "Open" | "Cancelled";

/**
 * Schwab's raw statuses are many and inconsistently spelled for our purposes
 * (`CANCELED` with one L, plus a dozen pending/awaiting variants). Everything
 * user-facing — the filter tabs and the pill colour — keys off this bucket
 * rather than the raw string, so a new Schwab status can't silently fall out
 * of a filter.
 */
type StatusBucket = "filled" | "open" | "cancelled" | "other";

function bucketOf(status: string): StatusBucket {
  const s = status.toUpperCase();
  if (s === "FILLED" || s === "COMPLETED" || s === "REPLACED") return "filled";
  if (s === "CANCELED" || s === "CANCELLED" || s === "REJECTED" || s === "EXPIRED") {
    return "cancelled";
  }
  if (
    s === "WORKING" ||
    s === "QUEUED" ||
    s === "NEW" ||
    s === "ACCEPTED" ||
    s.startsWith("PENDING") ||
    s.startsWith("AWAITING")
  ) {
    return "open";
  }
  return "other";
}

function statusTone(status: string): "emerald" | "amber" | "blue" | "rose" | "neutral" {
  switch (bucketOf(status)) {
    case "filled":
      return "emerald";
    case "open":
      return "blue";
    case "cancelled":
      return "rose";
    default:
      return "neutral";
  }
}

/** Schwab's SCREAMING_SNAKE statuses read badly in a pill. */
function prettyStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtCompact(n: number) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${n < 0 ? "-" : ""}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${n < 0 ? "-" : ""}$${(abs / 1e3).toFixed(1)}K`;
  return fmtUsd(n);
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CACHE_KEY = "gf_orders_cache";
const CACHE_TTL = 60_000; // 60 s

function readCache(): OrderRow[] {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const { ts, orders } = JSON.parse(raw) as { ts: number; orders: OrderRow[] };
    if (Date.now() - ts < CACHE_TTL && Array.isArray(orders)) return orders;
  } catch {
    /* ignore */
  }
  return [];
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
      const res = await fetch(`/api/schwab/orders?days=${WINDOW_DAYS}`);
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        orders?: OrderRow[];
        message?: string;
      };
      if (!res.ok || !json.ok) {
        setErr(json.message ?? `Failed to load orders (${res.status})`);
        return;
      }
      setErr(null);
      setOrders(json.orders ?? []);
      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: Date.now(), orders: json.orders ?? [] }),
        );
      } catch {
        /* ignore */
      }
    } catch {
      setErr("Network error");
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/schwab/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: WINDOW_DAYS }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        // A failed sync used to look identical to a successful one that found
        // nothing — surface it instead.
        setErr(json.message ?? `Sync failed (${res.status})`);
        return;
      }
      await loadOrders();
    } catch {
      setErr("Sync failed: network error");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    // Paint cached rows immediately while the fresh fetch is in flight. Read
    // here rather than in a lazy useState initialiser: sessionStorage doesn't
    // exist during SSR, so seeding at render time would mismatch on hydration.
    const cached = readCache();
    if (cached.length > 0) {
      setOrders(cached);
      setLoading(false);
    }

    loadOrders().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadOrders is stable for the component's lifetime
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const isToday = (o: OrderRow) => new Date(o.timestamp).toDateString() === today;

    const todays = orders.filter(isToday);
    const notional = (rows: OrderRow[]) =>
      rows.reduce((s, o) => s + (o.quantity || 0) * (o.fillPrice || 0), 0);

    const filledToday = todays.filter((o) => bucketOf(o.status) === "filled");
    const filledAll = orders.filter((o) => bucketOf(o.status) === "filled");

    return {
      todayCount: todays.length,
      filledTodayCount: filledToday.length,
      volumeToday: notional(filledToday),
      volumeWindow: notional(filledAll),
      openCount: orders.filter((o) => bucketOf(o.status) === "open").length,
      fillRate: orders.length > 0 ? Math.round((filledAll.length / orders.length) * 100) : null,
      filledAllCount: filledAll.length,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = [...orders];
    if (statusFilter !== "All") {
      const want = statusFilter.toLowerCase() as StatusBucket;
      rows = rows.filter((o) => bucketOf(o.status) === want);
    }
    if (q) {
      rows = rows.filter((o) =>
        [o.orderId, o.ticker, o.side, o.status, String(o.quantity), o.timestamp]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return rows.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [orders, statusFilter, query]);

  function exportOrders() {
    downloadXlsx(
      ["Order ID", "Side", "Ticker", "Quantity", "Fill Price", "Status", "Time"],
      filtered.map((o) => [
        o.orderId,
        o.side,
        o.ticker,
        o.quantity,
        o.fillPrice,
        o.status,
        o.timestamp,
      ]),
      "garnet-fund-trade-history",
    );
  }

  const kpiTiles = [
    {
      label: "Orders today",
      value: String(stats.todayCount),
      sub: `${stats.filledTodayCount} filled`,
    },
    {
      label: "Volume today",
      value: fmtCompact(stats.volumeToday),
      sub: "Notional filled today",
    },
    {
      label: "Volume (12 mo)",
      value: fmtCompact(stats.volumeWindow),
      sub: `${stats.filledAllCount} fills`,
    },
    {
      label: "Fill rate",
      value: stats.fillRate == null ? "—" : `${stats.fillRate}%`,
      sub: "Trailing 12 months",
    },
    {
      label: "Open orders",
      value: String(stats.openCount),
      sub: "Working or pending",
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Trade History"
        meta={`${orders.length} order${orders.length === 1 ? "" : "s"} · last 12 months`}
        actions={
          <>
            <GhostBtn onClick={() => void syncNow()} disabled={syncing}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing" : "Sync now"}
            </GhostBtn>
            <GhostBtn onClick={exportOrders} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Export
            </GhostBtn>
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      {err && (
        <p className="border border-neg/40 bg-neg-soft px-3 py-2 text-[13px] text-neg">{err}</p>
      )}

      <TableShell
        title="Orders"
        count={filtered.length}
        className="min-h-0 flex-1"
        actions={
          <>
            <div className="glass-input flex h-7 w-[190px] items-center gap-1.5 rounded-none px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
                placeholder="Ticker, side, status"
              />
            </div>
            <FilterTabs
              options={["All", "Filled", "Open", "Cancelled"] as StatusFilter[]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </>
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
                <td colSpan={7} className="px-3 py-12 text-center text-[13.5px] text-ink-3">
                  Loading orders…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-[13.5px] text-ink-3">
                  {orders.length === 0
                    ? "No orders synced yet. Use Sync now to pull them from Schwab."
                    : "No orders match this filter."}
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
                        o.side === "BUY" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"
                      }`}
                    >
                      {o.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[14px] font-semibold text-ink">{o.ticker}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[14px] text-ink">
                    {o.quantity.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[14px] text-ink">
                    {fmtUsd(o.fillPrice)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill label={prettyStatus(o.status)} tone={statusTone(o.status)} />
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
