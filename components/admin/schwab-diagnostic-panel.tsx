import type { SchwabDiagnostics } from "@/lib/data";
import { SchwabSyncButton } from "./schwab-sync-button";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function usd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
      ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
    }`}>
      <StatusDot ok={ok} />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

export function SchwabDiagnosticPanel({
  data,
  liveVerification,
}: {
  data: SchwabDiagnostics;
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
  const { token, lastSync } = data;
  const tokenExpired  = token.expiresAt ? new Date(token.expiresAt) < new Date() : false;
  const tokenHealthy  = token.present && !token.needsReauth && !tokenExpired;
  const lv            = liveVerification;
  const traderOk      = lv?.liquidationValue !== null && lv?.liquidationValue !== undefined;
  const marketOk      = lv?.spyPrice !== null && lv?.spyPrice !== undefined;
  const syncOk        = lastSync?.status === "completed" && lastSync?.level !== "error";

  return (
    <section className="panel p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="caps-label">Schwab Integration</p>
          <h2 className="text-sm font-semibold text-white">API Health &amp; Account</h2>
        </div>
        <SchwabSyncButton />
      </div>

      {/* Token + account + market data + last sync — all in one panel */}
      <div className="rounded-[10px] bg-white/[0.03] divide-y divide-white/[0.05]">

        {/* ── OAuth Token ── */}
        <div className="px-4 py-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-zinc-400">OAuth Token</p>
            <StatusBadge
              ok={tokenHealthy}
              label={
                !token.present      ? "No token — OAuth required"
                : token.needsReauth ? "Needs re-auth"
                : tokenExpired      ? "Expired"
                : "Connected"
              }
            />
          </div>
          <Row label="Expires"        value={fmt(token.expiresAt)} />
          <Row label="Last refreshed" value={fmt(token.updatedAt)} />
          {!tokenHealthy && (
            <p className="pt-1.5 text-xs text-zinc-500">
              Re-authorize at{" "}
              <a
                href="/api/schwab/auth-url?provider=trader"
                target="_blank"
                className="underline text-zinc-400 hover:text-white"
              >
                /api/schwab/auth-url?provider=trader
              </a>
            </p>
          )}
        </div>

        {/* ── Trader API (live account data) ── */}
        <div className="px-4 py-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-zinc-400">Trader API</p>
            <StatusBadge ok={traderOk} label={traderOk ? "Active" : "Unavailable"} />
          </div>
          {lv?.accountNumber && (
            <Row label="Account" value={`#${lv.accountNumber}`} />
          )}
          {traderOk && (
            <>
              <Row label="Account value"  value={usd(lv!.liquidationValue!)} />
              <Row label="Cash available" value={usd(lv!.cashAvailable ?? 0)} />
              <Row label="Open positions" value={String(lv!.positionCount ?? 0)} />
            </>
          )}
        </div>

        {/* ── Market Data API ── */}
        <div className="px-4 py-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-zinc-400">Market Data API</p>
            <StatusBadge ok={marketOk} label={marketOk ? "Active" : "Unavailable"} />
          </div>
          {marketOk && (
            <>
              <Row label="SPY"            value={`$${lv!.spyPrice!.toFixed(2)}`} />
              <Row
                label="SPY day change"
                value={`${(lv!.spyChange ?? 0) >= 0 ? "+" : ""}${(lv!.spyChange ?? 0).toFixed(2)}%`}
              />
              <Row label="Market status"  value={lv!.marketIsOpen ? "Open" : "Closed"} />
            </>
          )}
          {lv?.verifiedAt && (
            <p className="pt-1 text-[10px] text-zinc-600">Verified {fmt(lv.verifiedAt)}</p>
          )}
        </div>

        {/* ── Last Sync ── */}
        <div className="px-4 py-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-zinc-400">Last Sync</p>
            {lastSync ? (
              <StatusBadge ok={syncOk} label={syncOk ? "Completed" : (lastSync.level === "error" ? `Failed — ${lastSync.message ?? "error"}` : lastSync.status)} />
            ) : (
              <span className="text-xs text-zinc-600">Never</span>
            )}
          </div>
          {lastSync && (
            <>
              <Row label="Started"   value={fmt(lastSync.startedAt)} />
              <Row label="Finished"  value={fmt(lastSync.finishedAt)} />
              <Row label="Accounts"  value={lastSync.accountCount} />
              <Row label="Positions" value={lastSync.positionCount} />
              <Row label="Market value" value={usd(lastSync.totalMarketValue)} />
              {lastSync.positionCount === 0 && syncOk && (
                <p className="pt-1.5 text-xs text-amber-400">
                  Sync completed — account is cash only. Holdings populate once securities are purchased.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
