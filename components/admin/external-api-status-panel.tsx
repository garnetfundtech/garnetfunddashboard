"use client";

import { startTransition, useEffect, useState } from "react";
import type { ApiHealth } from "@/lib/external-api-status";
import { cn } from "@/lib/utils";
import type { SchwabDiagnostics } from "@/lib/data";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-1.5 w-1.5 rounded-full",
        ok ? "bg-emerald-400" : "bg-red-400",
      )}
    />
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
      )}
    >
      <StatusDot ok={ok} />
      {label}
    </span>
  );
}

function fmtRemaining(ms: number) {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ExternalApiStatusPanel({
  rows,
  schwabDiagnostics,
  liveVerification,
}: {
  rows: ApiHealth[];
  schwabDiagnostics?: SchwabDiagnostics;
  liveVerification?: {
    accountNumber: string | null;
    liquidationValue: number | null;
    cashAvailable: number | null;
    positionCount: number | null;
    spyPrice: number | null;
    spyChange: number | null;
    marketIsOpen: boolean | null;
    verifiedAt: string | null;
  } | null;
}) {
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => { startTransition(() => { setNowMs(Date.now()); }); }, []);
  const token = schwabDiagnostics?.token;
  const tokenExpired = token?.expiresAt ? new Date(token.expiresAt) < new Date(nowMs) : false;
  const authOk = Boolean(token?.present && !token?.needsReauth && !tokenExpired);
  const traderOk = liveVerification?.liquidationValue != null;
  const marketOk = liveVerification?.spyPrice != null;

  const refreshTarget = token?.refreshExpiresAt ?? token?.expiresAt ?? null;
  const refreshRemaining =
    refreshTarget != null ? new Date(refreshTarget).getTime() - nowMs : null;
  const refreshExpired = refreshRemaining != null ? refreshRemaining <= 0 : false;

  async function reauthSchwab() {
    try {
      const res = await fetch("/api/schwab/auth-url?provider=trader");
      const json = (await res.json()) as { ok?: boolean; url?: string; message?: string };
      if (json.ok && json.url) window.location.href = json.url;
      else alert(json.message ?? "Could not start Schwab OAuth.");
    } catch {
      alert("Network error starting OAuth.");
    }
  }

  return (
    <section className="panel p-5 space-y-4">
      <div>
        <p className="caps-label">External integrations</p>
        <h2 className="text-sm font-semibold text-white">API status</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Status checks are lightweight pings; “endpoints used” reflect what this dashboard calls for displayed data.
        </p>
      </div>

      <div className="rounded-[10px] bg-white/[0.03] divide-y divide-white/[0.05]">
        {rows.map((r) => (
          <div key={r.key} className="px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{r.label}</p>
                <p className="text-[11px] text-zinc-500 truncate">{r.detail}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">
                  {r.usedEndpoints.length} used / {r.totalOffered} offered
                </span>
                <StatusBadge ok={r.ok} label={r.ok ? "Connected" : "Disconnected"} />
              </div>
            </div>

            {r.key === "schwab" && schwabDiagnostics ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge ok={authOk} label="Auth" />
                  <StatusBadge ok={traderOk} label="Trader" />
                  <StatusBadge ok={marketOk} label="API market data" />
                </div>
                <div className="text-[11px] text-zinc-500">
                  Last sync:{" "}
                  <span className="text-zinc-400">
                    {schwabDiagnostics.lastSync?.finishedAt ? fmt(schwabDiagnostics.lastSync.finishedAt) : "—"}
                  </span>
                </div>
              </div>
            ) : null}

            <details className="group">
              <summary className="cursor-pointer select-none text-[11px] text-zinc-400 hover:text-white">
                Endpoints in use
              </summary>
              <ul className="mt-2 space-y-1 text-[11px] text-zinc-400">
                {r.usedEndpoints.map((e) => (
                  <li key={e} className="font-mono text-zinc-500">
                    {e}
                  </li>
                ))}
              </ul>

              {r.key === "schwab" && schwabDiagnostics ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-zinc-500">
                    Refresh token:{" "}
                    <span className={cn("tabular-nums", refreshExpired ? "text-rose-300" : "text-zinc-400")}>
                      {refreshRemaining != null ? fmtRemaining(refreshRemaining) : "—"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void reauthSchwab()}
                    className={cn(
                      "rounded-[8px] px-2.5 py-1.5 text-[11px] font-medium transition",
                      refreshExpired
                        ? "bg-rose-500/15 text-rose-300 animate-pulse hover:bg-rose-500/25"
                        : "bg-white/[0.04] text-zinc-300 hover:bg-white/10",
                    )}
                  >
                    Refresh token
                  </button>
                </div>
              ) : null}
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}

