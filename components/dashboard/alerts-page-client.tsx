"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { createAlertAction, deleteAlertAction, dismissAlertAction } from "@/app/(dashboard)/alerts/actions";
import type { StockAlert } from "@/app/(dashboard)/alerts/page";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { StatusPill } from "@/components/dashboard/status-pill";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import { GICS_SECTORS } from "@/lib/sectors";

function fmtPrice(n: number | null) {
  if (n == null) return "$XX.XX";
  return `$${n.toFixed(2)}`;
}

type AlertFilter = "all" | "active" | "triggered" | "dismissed";

function alertStatusTone(
  status: StockAlert["status"],
): "blue" | "rose" | "neutral" | "emerald" {
  if (status === "active") return "blue";
  if (status === "triggered_buy" || status === "triggered_sell") return "rose";
  return "neutral";
}

function alertStatusLabel(status: StockAlert["status"]) {
  if (status === "triggered_buy") return "triggered";
  if (status === "triggered_sell") return "triggered";
  if (status === "dismissed") return "dismissed";
  return "armed";
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AlertsPageClient({
  alerts: initialAlerts,
  currentUserId,
}: {
  alerts: StockAlert[];
  currentUserId: string;
}) {
  const [alerts, setAlerts] = useState<StockAlert[]>(initialAlerts);
  const [filter, setFilter] = useState<AlertFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formTicker, setFormTicker] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formLivePrice, setFormLivePrice] = useState<number | null>(null);
  const [formBuyLimit, setFormBuyLimit] = useState("");
  const [formSellLimit, setFormSellLimit] = useState("");
  const [tickerLookupLoading, setTickerLookupLoading] = useState(false);

  function handleTickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
    setFormTicker(val);
    setFormCompany("");
    setFormLivePrice(null);
    setFormBuyLimit("");
    setFormSellLimit("");
    if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    if (val.length < 1) return;
    tickerDebounceRef.current = setTimeout(async () => {
      setTickerLookupLoading(true);
      try {
        const res = await fetch(`/api/schwab/market/quotes?symbols=${val}`);
        const data = (await res.json()) as Record<
          string,
          { description?: string; quote?: { lastPrice?: number } }
        >;
        const entry = data[val];
        if (entry) {
          setFormCompany(entry.description ?? "");
          const price = entry.quote?.lastPrice ?? null;
          setFormLivePrice(price);
          if (price != null) {
            setFormBuyLimit(price.toFixed(2));
            setFormSellLimit(price.toFixed(2));
          }
        }
      } catch {
        /* ignore */
      } finally {
        setTickerLookupLoading(false);
      }
    }, 600);
  }

  const refreshPrices = useCallback(async () => {
    const active = alerts.filter((a) => a.status === "active");
    if (!active.length) return;
    const tickers = [...new Set(active.map((a) => a.ticker))];
    try {
      const res = await fetch("/api/alerts/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        prices?: Record<string, number>;
      };
      if (data.prices) {
        setAlerts((prev) =>
          prev.map((a) => ({
            ...a,
            currentPrice: data.prices?.[a.ticker] ?? a.currentPrice,
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, [alerts]);

  useEffect(() => {
    refreshPrices();
    refreshIntervalRef.current = setInterval(refreshPrices, 30000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [refreshPrices]);

  function handleDelete(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteAlertAction(fd);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    });
  }

  function handleDismiss(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await dismissAlertAction(fd);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "dismissed" as const } : a,
        ),
      );
    });
  }

  const filtered = alerts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "active") return a.status === "active";
    if (filter === "triggered")
      return a.status === "triggered_buy" || a.status === "triggered_sell";
    if (filter === "dismissed") return a.status === "dismissed";
    return true;
  });

  const armedCount = alerts.filter((a) => a.status === "active").length;
  const triggeredCount = alerts.filter(
    (a) => a.status === "triggered_buy" || a.status === "triggered_sell",
  ).length;
  const snoozedCount = alerts.filter((a) => a.status === "dismissed").length;
  const uniqueTickers = new Set(alerts.map((a) => a.ticker)).size;

  const recentTriggered = alerts
    .filter(
      (a) => a.status === "triggered_buy" || a.status === "triggered_sell",
    )
    .sort(
      (a, b) =>
        new Date(b.triggeredAt ?? b.createdAt).getTime() -
        new Date(a.triggeredAt ?? a.createdAt).getTime(),
    )
    .slice(0, 8);

  const kpiTiles = [
    { label: "Active alerts", value: String(armedCount), sub: "Awaiting trigger" },
    {
      label: "Triggered (24h)",
      value: String(triggeredCount),
      sub: "Sent to email + app",
      tone: triggeredCount > 0 ? ("neg" as const) : null,
    },
    { label: "Snoozed", value: String(snoozedCount), sub: "Mute until tomorrow" },
    { label: "Symbols watched", value: String(uniqueTickers), sub: "Distinct tickers" },
    { label: "Avg time to fire", value: "XXm", sub: "Trailing 30 days" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Price & Condition Alerts"
        meta={`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}
        actions={
          <>
            <PrimaryBtn onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5" />
              New alert
            </PrimaryBtn>
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)" }}
      >
        {/* Left — Conditions table */}
        <TableShell
          title="Conditions"
          count={filtered.length}
          actions={
            <FilterTabs
              options={
                [
                  { value: "all", label: "All" },
                  { value: "active", label: "Armed" },
                  { value: "triggered", label: "Triggered" },
                  { value: "dismissed", label: "Snoozed" },
                ] as { value: AlertFilter; label: string }[]
              }
              value={filter}
              onChange={setFilter}
            />
          }
        >
          <table className="w-full">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="px-3 py-2 font-medium">Buy limit</th>
                <th className="px-3 py-2 font-medium">Sell limit</th>
                <th className="px-3 py-2 text-right font-medium">Current</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-12 text-center text-[13.5px] text-ink-3"
                  >
                    No alerts match this filter.
                  </td>
                </tr>
              )}
              {filtered.map((alert) => (
                <tr
                  key={alert.id}
                  className="border-b border-line last:border-b-0 transition hover:bg-paper-3"
                >
                  <td className="px-3 py-2">
                    <span className="text-[14px] font-semibold text-ink">
                      {alert.ticker}
                    </span>
                    {alert.companyName && (
                      <span className="ml-1 text-[12px] text-ink-3">
                        {alert.companyName}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink">
                    {fmtPrice(alert.buyLimit)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink">
                    {fmtPrice(alert.sellLimit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[14px] text-ink">
                    {fmtPrice(alert.currentPrice)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      label={alertStatusLabel(alert.status)}
                      tone={alertStatusTone(alert.status)}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">
                    {fmtWhen(alert.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {alert.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleDismiss(alert.id)}
                          disabled={isPending}
                          className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-ink"
                        >
                          <Bell className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {alert.createdBy === currentUserId && (
                        <button
                          type="button"
                          onClick={() => handleDelete(alert.id)}
                          disabled={isPending}
                          className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-neg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        {/* Right — Recently triggered card */}
        <div className="panel p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Recently triggered
          </p>
          <p className="mt-0.5 text-[15px] font-semibold text-ink">
            Last 7 days
          </p>
          <ul className="mt-3 space-y-0.5">
            {recentTriggered.length === 0 && (
              <li className="text-[13px] text-ink-3">No triggered alerts.</li>
            )}
            {recentTriggered.map((a) => (
              <li key={a.id}>
                <div className="flex items-center gap-2 rounded-none px-1.5 py-1.5 hover:bg-paper-3">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-none bg-neg" />
                  <span className="min-w-0 flex-1 text-[13.5px] text-ink">
                    <span className="font-semibold text-ink">{a.ticker}</span>
                    {" "}
                    {a.status === "triggered_buy" ? "hit buy limit" : "hit sell limit"}
                    {a.companyName ? ` (${a.companyName})` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] text-ink-3">
                    {fmtWhen(a.triggeredAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* New alert form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6 backdrop-blur-sm">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Alerts</p>
                <h2 className="text-base font-semibold text-ink">New alert</h2>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-none p-1.5 text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                ×
              </button>
            </div>
            <form
              ref={formRef}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(async () => {
                  await createAlertAction(fd);
                  setShowForm(false);
                  formRef.current?.reset();
                  setFormTicker("");
                  setFormCompany("");
                  setFormLivePrice(null);
                  setFormBuyLimit("");
                  setFormSellLimit("");
                });
              }}
            >
              <div>
                <input
                  name="ticker"
                  value={formTicker}
                  onChange={handleTickerChange}
                  className="glass-input w-full px-3 py-2.5 text-sm uppercase text-ink outline-none placeholder:text-ink-3"
                  placeholder="Ticker (e.g. AAPL)"
                  required
                />
                {tickerLookupLoading && (
                  <p className="mt-1 text-[13px] text-ink-3">Looking up…</p>
                )}
                {formCompany && (
                  <>
                    <input type="hidden" name="companyName" value={formCompany} />
                    <p className="mt-1 text-[13px] text-ink-2">{formCompany}</p>
                  </>
                )}
                {formLivePrice !== null && (
                  <p className="mt-0.5 text-[13px] text-pos">
                    Live: ${formLivePrice.toFixed(2)}
                  </p>
                )}
              </div>
              <select
                name="sector"
                className="glass-input w-full bg-transparent px-3 py-2.5 text-sm text-ink outline-none"
              >
                <option value="">Select sector</option>
                {GICS_SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                name="buyLimit"
                type="number"
                step="0.01"
                required
                value={formBuyLimit}
                onChange={(e) => setFormBuyLimit(e.target.value)}
                className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
                placeholder="Buy limit"
              />
              <input
                name="sellLimit"
                type="number"
                step="0.01"
                required
                value={formSellLimit}
                onChange={(e) => setFormSellLimit(e.target.value)}
                className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
                placeholder="Sell limit"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-none px-4 py-2 text-sm text-ink-2 hover:bg-paper-2 hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-none bg-garnet px-4 py-2 text-sm font-medium text-white hover:bg-garnet-hover disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
