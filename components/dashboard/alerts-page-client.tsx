"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Bell, BellRing, Plus, Trash2, X } from "lucide-react";
import { createAlertAction, deleteAlertAction, dismissAlertAction } from "@/app/(dashboard)/alerts/actions";
import type { StockAlert } from "@/app/(dashboard)/alerts/page";
import { cn } from "@/lib/utils";

const SECTORS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Industrials",
  "Communication Services",
  "Energy",
  "Basic Materials",
  "Real Estate",
  "Utilities",
];

function fmtPrice(n: number | null) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function StatusBadge({ status }: { status: StockAlert["status"] }) {
  if (status === "triggered_sell") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-400">
        <BellRing className="h-2.5 w-2.5" />
        Sell limit hit
      </span>
    );
  }
  if (status === "triggered_buy") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
        <BellRing className="h-2.5 w-2.5" />
        Buy limit hit
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-zinc-400">
      <Bell className="h-2.5 w-2.5" />
      Watching
    </span>
  );
}

type Filter = "all" | "mine" | string;

export function AlertsPageClient({
  alerts: initialAlerts,
  currentUserId,
}: {
  alerts: StockAlert[];
  currentUserId: string;
}) {
  const [alerts, setAlerts] = useState<StockAlert[]>(initialAlerts);
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formTicker, setFormTicker] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formLivePrice, setFormLivePrice] = useState<number | null>(null);
  const [tickerLookupLoading, setTickerLookupLoading] = useState(false);

  function handleTickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
    setFormTicker(val);
    setFormCompany("");
    setFormLivePrice(null);
    if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    if (val.length < 1) return;
    tickerDebounceRef.current = setTimeout(async () => {
      setTickerLookupLoading(true);
      try {
        const res = await fetch(`/api/schwab/market/quotes?symbols=${encodeURIComponent(val)}`);
        const json = (await res.json()) as { ok: boolean; data?: Record<string, { description?: string; quote?: { lastPrice?: number } }> };
        if (json.ok && json.data?.[val]) {
          const q = json.data[val];
          if (q.description) setFormCompany(q.description);
          if (q.quote?.lastPrice != null) setFormLivePrice(q.quote.lastPrice);
        }
      } catch { /* ignore */ } finally {
        setTickerLookupLoading(false);
      }
    }, 500);
  }

  const refreshPrices = useCallback(async () => {
    const tickers = [...new Set(alerts.map((a) => a.ticker))];
    if (!tickers.length) return;
    try {
      const res = await fetch("/api/alerts/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const json = (await res.json()) as { ok: boolean; prices?: Record<string, number> };
      if (!json.ok || !json.prices) return;
      setAlerts((prev) =>
        prev.map((a) => {
          const price = json.prices![a.ticker];
          if (price == null) return a;
          let newStatus = a.status;
          if (a.status === "active") {
            if (a.sellLimit != null && price >= a.sellLimit) newStatus = "triggered_sell";
            else if (a.buyLimit != null && price <= a.buyLimit) newStatus = "triggered_buy";
          }
          return { ...a, currentPrice: price, status: newStatus };
        }),
      );
    } catch {
      // silently fail — stale prices are better than crashing
    }
  }, [alerts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState only fires after await fetch, not synchronously
    void refreshPrices();
    refreshIntervalRef.current = setInterval(() => void refreshPrices(), 30_000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSectors = [...new Set(alerts.map((a) => a.sector))].sort();

  const filtered = alerts.filter((a) => {
    if (filter === "mine") return a.createdBy === currentUserId;
    if (filter !== "all") return a.sector === filter;
    return true;
  });

  const triggeredCount = alerts.filter(
    (a) => a.status === "triggered_buy" || a.status === "triggered_sell",
  ).length;

  function resetForm() {
    setFormTicker("");
    setFormCompany("");
    setFormLivePrice(null);
    formRef.current?.reset();
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createAlertAction(fd);
      resetForm();
      setShowForm(false);
    });
  }

  function handleDismiss(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await dismissAlertAction(fd);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "active", triggeredAt: null } : a)),
      );
    });
  }

  function handleDelete(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteAlertAction(fd);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="page-title">Alerts</h1>
          {triggeredCount > 0 && (
            <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-medium text-rose-400">
              {triggeredCount} triggered
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => { if (v) resetForm(); return !v; }); }}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a80705]"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add Alert"}
        </button>
      </div>

      {/* Add alert form */}
      {showForm && (
        <div className="panel p-5">
          <p className="caps-label mb-4">New Alert</p>
          <form ref={formRef} onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex gap-2">
              <div className="relative shrink-0">
                <input
                  name="ticker"
                  placeholder="Ticker (e.g. AAPL)"
                  required
                  value={formTicker}
                  onChange={handleTickerChange}
                  className="glass-input w-28 px-3 py-2.5 text-sm uppercase text-zinc-200 outline-none placeholder:text-zinc-500"
                />
                {tickerLookupLoading && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 animate-pulse">…</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-0.5">
                <input
                  name="companyName"
                  placeholder="Company name"
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                />
                {formLivePrice != null && (
                  <p className="px-1 text-[11px] text-zinc-500">
                    Current price: <span className="text-zinc-300">${formLivePrice.toFixed(2)}</span>
                  </p>
                )}
              </div>
            </div>
            <select
              name="sector"
              required
              defaultValue=""
              className="glass-input px-3 py-2.5 text-sm text-zinc-200 outline-none"
            >
              <option value="" disabled>Select sector</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                name="buyLimit"
                type="number"
                step="0.01"
                min="0"
                placeholder="Buy limit ($)"
                className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />
              <input
                name="sellLimit"
                type="number"
                step="0.01"
                min="0"
                placeholder="Sell limit ($)"
                className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a80705] disabled:opacity-50"
              >
                {isPending ? "Adding…" : "Add Alert"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {(["all", "mine", ...allSectors] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f
                ? "bg-white/[0.12] text-white"
                : "bg-white/[0.04] text-zinc-400 hover:text-white",
            )}
          >
            {f === "all" ? "All Alerts" : f === "mine" ? "My Alerts" : f}
          </button>
        ))}
      </div>

      {/* Alerts table */}
      {filtered.length === 0 ? (
        <div className="panel px-4 py-14 text-center text-sm text-zinc-500">
          {alerts.length === 0
            ? "No alerts yet. Add one above to start tracking."
            : "No alerts match this filter."}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/[0.06] text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Ticker</th>
                  <th className="px-4 py-3 text-left font-medium">Company</th>
                  <th className="px-4 py-3 text-left font-medium">Sector</th>
                  <th className="px-4 py-3 text-right font-medium">Current</th>
                  <th className="px-4 py-3 text-right font-medium">Buy Limit</th>
                  <th className="px-4 py-3 text-right font-medium">Sell Limit</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((alert) => {
                  const triggered =
                    alert.status === "triggered_buy" || alert.status === "triggered_sell";
                  return (
                    <tr
                      key={alert.id}
                      className={cn(
                        "border-b border-white/[0.03]",
                        triggered && "bg-white/[0.02]",
                      )}
                    >
                      <td className="px-4 py-3 font-semibold text-white">{alert.ticker}</td>
                      <td className="px-4 py-3 text-zinc-400">{alert.companyName ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-400">{alert.sector}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-200">
                        {fmtPrice(alert.currentPrice)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right tabular-nums",
                          alert.status === "triggered_buy"
                            ? "font-semibold text-emerald-400"
                            : "text-zinc-400",
                        )}
                      >
                        {fmtPrice(alert.buyLimit)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right tabular-nums",
                          alert.status === "triggered_sell"
                            ? "font-semibold text-rose-400"
                            : "text-zinc-400",
                        )}
                      >
                        {fmtPrice(alert.sellLimit)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={alert.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {triggered && alert.createdBy === currentUserId && (
                            <button
                              type="button"
                              onClick={() => handleDismiss(alert.id)}
                              disabled={isPending}
                              className="rounded-[6px] bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          )}
                          {alert.createdBy === currentUserId && (
                            <button
                              type="button"
                              onClick={() => handleDelete(alert.id)}
                              disabled={isPending}
                              className="rounded-[6px] p-1.5 text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
