"use client";

import { startTransition, useEffect, useState } from "react";
import type { ApiHealth } from "@/lib/external-api-status";
import { cn } from "@/lib/utils";
import type { SchwabDiagnostics } from "@/lib/data";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-1.5 w-1.5 rounded-none",
        ok ? "bg-pos" : "bg-neg",
      )}
    />
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-none px-2 py-0.5 text-xs font-medium",
        ok ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg",
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
  // nowMs is 0 until the mount effect runs, which would read as "expired by 56
  // years" and flash the warning on every load.
  const refreshRemaining =
    nowMs > 0 && refreshTarget != null ? new Date(refreshTarget).getTime() - nowMs : null;
  const refreshExpired = refreshRemaining != null ? refreshRemaining <= 0 : false;
  // Schwab caps the refresh token at 7 days, so the last two are the window
  // where someone has to act. Matches WARN_WITHIN_MS in lib/schwab-token-alert.ts,
  // which is when the reminder email goes out.
  const refreshExpiringSoon =
    refreshRemaining != null && refreshRemaining > 0 && refreshRemaining <= 48 * 3600000;

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
        <h2 className="text-sm font-semibold text-ink">API status</h2>
        <p className="mt-1 text-xs text-ink-3">
          Status checks are lightweight pings; “endpoints used” reflect what this dashboard calls for displayed data.
        </p>
      </div>

      <div className="rounded-none bg-paper-3 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.key} className="px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{r.label}</p>
                <p className="text-[12.5px] text-ink-3 truncate">{r.detail}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] text-ink-3">
                  {r.usedEndpoints.length} used / {r.totalOffered} offered
                </span>
                <StatusBadge ok={r.ok} label={r.ok ? "Connected" : "Disconnected"} />
              </div>
            </div>

            {r.key === "schwab" && schwabDiagnostics ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge ok={authOk} label="Auth" />
                    <StatusBadge ok={traderOk} label="Trader" />
                    <StatusBadge ok={marketOk} label="API market data" />
                  </div>
                  <div className="text-[12.5px] text-ink-3">
                    Last sync:{" "}
                    <span className="text-ink-2">
                      {schwabDiagnostics.lastSync?.finishedAt ? fmt(schwabDiagnostics.lastSync.finishedAt) : "—"}
                    </span>
                  </div>
                </div>

                {/*
                  The seven-day clock, in the open. This countdown and its
                  button used to sit inside the "Endpoints in use" disclosure
                  below, where nobody looked — so the first sign the token had
                  lapsed was the dashboard going blank. It is the one thing on
                  this panel that needs a human on a schedule, so it reads as a
                  row of its own and turns amber, then red, as the deadline
                  arrives. The reminder email is the backstop, not this.
                */}
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 border px-3 py-2",
                    refreshExpired
                      ? "border-neg-line bg-neg-soft"
                      : refreshExpiringSoon
                        ? "border-warn-line bg-warn-soft"
                        : "border-line bg-paper-2",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-ink-2">
                      Schwab re-auth{" "}
                      <span
                        className={cn(
                          "tabular-nums font-medium",
                          refreshExpired
                            ? "text-neg"
                            : refreshExpiringSoon
                              ? "text-warn"
                              : "text-ink",
                        )}
                      >
                        {refreshRemaining != null ? fmtRemaining(refreshRemaining) : "—"}
                      </span>
                    </p>
                    <p className="text-[11.5px] text-ink-3">
                      {refreshExpired
                        ? "Live data is stale until someone signs in to Schwab again."
                        : "Schwab caps the refresh token at 7 days and will not extend it."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void reauthSchwab()}
                    className={cn(
                      "shrink-0 rounded-none px-3 py-1.5 text-[12.5px] font-medium transition",
                      refreshExpired || refreshExpiringSoon
                        ? "bg-garnet text-white hover:bg-garnet-hover"
                        : "bg-paper-3 text-ink hover:bg-paper-2",
                    )}
                  >
                    Re-authenticate
                  </button>
                </div>
              </>
            ) : null}

            <details className="group">
              <summary className="cursor-pointer select-none text-[12.5px] text-ink-2 hover:text-ink">
                Endpoints in use
              </summary>
              <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">
                {r.usedEndpoints.map((e) => (
                  <li key={e} className="font-mono text-ink-3">
                    {e}
                  </li>
                ))}
              </ul>

              {r.key === "schwab" && schwabDiagnostics ? (
                <div className="mt-3 text-[12.5px] text-ink-3">
                  Refresh token expires{" "}
                  <span className="text-ink-2">{fmt(token?.refreshExpiresAt ?? null)}</span>
                  {" · "}last refreshed{" "}
                  <span className="text-ink-2">{fmt(token?.updatedAt ?? null)}</span>
                </div>
              ) : null}
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}

