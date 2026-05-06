import type { SchwabDiagnostics } from "@/lib/data";
import { SchwabSyncButton } from "./schwab-sync-button";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function VerifiedRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-zinc-400">{label}</span>
      <div className="text-right">
        <span className="font-semibold text-white">{value}</span>
        {note && <p className="text-[10px] text-zinc-500">{note}</p>}
      </div>
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

  const tokenExpired = token.expiresAt ? new Date(token.expiresAt) < new Date() : false;
  const tokenHealthy = token.present && !token.needsReauth && !tokenExpired;

  const lv = liveVerification;
  const apiVerified = lv?.liquidationValue !== null && lv?.liquidationValue !== undefined;
  const marketVerified = lv?.spyPrice !== null && lv?.spyPrice !== undefined;

  return (
    <section className="panel p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="caps-label">Schwab Integration</p>
          <h2 className="text-sm font-semibold text-white">API Health &amp; Diagnostics</h2>
        </div>
        <SchwabSyncButton />
      </div>

      {/* Live API verification */}
      {lv && (
        <div className="rounded-[10px] bg-emerald-500/5 border border-emerald-500/10 px-4 py-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <p className="caps-label text-emerald-400">Live API Verification</p>
            <StatusBadge ok={apiVerified} label={apiVerified ? "Trader API Active" : "Trader API Error"} />
          </div>
          {lv.accountNumber && (
            <VerifiedRow label="Account" value={`#${lv.accountNumber}`} note="Verified from Schwab" />
          )}
          {lv.liquidationValue !== null && lv.liquidationValue !== undefined && (
            <VerifiedRow
              label="Account Value"
              value={usd(lv.liquidationValue)}
              note="Live from Schwab Trader API"
            />
          )}
          {lv.cashAvailable !== null && lv.cashAvailable !== undefined && (
            <VerifiedRow label="Cash Available" value={usd(lv.cashAvailable)} />
          )}
          {lv.positionCount !== null && lv.positionCount !== undefined && (
            <VerifiedRow
              label="Open Positions"
              value={String(lv.positionCount)}
              note={lv.positionCount === 0 ? "Cash-only account" : undefined}
            />
          )}
          {lv.spyPrice !== null && lv.spyPrice !== undefined && (
            <>
              <div className="my-2 border-t border-white/5" />
              <div className="flex items-center justify-between mb-1">
                <p className="caps-label">Market Data API</p>
                <StatusBadge ok={marketVerified} label={marketVerified ? "Market Data Active" : "Market Data Error"} />
              </div>
              <VerifiedRow
                label="SPY Quote"
                value={`$${lv.spyPrice.toFixed(2)}`}
                note="Live from Schwab Market Data API"
              />
              {lv.spyChange !== null && lv.spyChange !== undefined && (
                <VerifiedRow
                  label="SPY Day Change"
                  value={`${lv.spyChange >= 0 ? "+" : ""}${lv.spyChange.toFixed(2)}%`}
                />
              )}
              <VerifiedRow
                label="Market Status"
                value={lv.marketIsOpen ? "Open" : "Closed"}
                note={lv.marketIsOpen ? "Regular session active" : undefined}
              />
            </>
          )}
          {lv.verifiedAt && (
            <p className="pt-1 text-[10px] text-zinc-600">Verified at {fmt(lv.verifiedAt)}</p>
          )}
        </div>
      )}

      {/* Token status */}
      <div className="rounded-[10px] bg-white/[0.03] px-4 py-3 space-y-0.5">
        <p className="caps-label mb-2">OAuth Token — Trader</p>
        <Row
          label="Status"
          value={
            !token.present ? (
              <StatusBadge ok={false} label="No token — OAuth required" />
            ) : token.needsReauth ? (
              <StatusBadge ok={false} label="Needs re-auth" />
            ) : tokenExpired ? (
              <StatusBadge ok={false} label="Expired" />
            ) : (
              <StatusBadge ok={true} label="Connected" />
            )
          }
        />
        <Row label="Expires" value={fmt(token.expiresAt)} />
        <Row label="Last refreshed" value={fmt(token.updatedAt)} />
        {!tokenHealthy && (
          <p className="pt-2 text-xs text-zinc-500">
            Re-authorize at{" "}
            <a
              href="/api/schwab/auth-url?provider=trader"
              target="_blank"
              className="underline text-zinc-400 hover:text-white"
            >
              /api/schwab/auth-url?provider=trader
            </a>
            , open the returned URL in your browser, then complete Schwab login.
          </p>
        )}
      </div>

      {/* Last sync */}
      <div className="rounded-[10px] bg-white/[0.03] px-4 py-3 space-y-0.5">
        <p className="caps-label mb-2">Last Sync</p>
        {!lastSync ? (
          <p className="text-sm text-zinc-500">No sync has run yet.</p>
        ) : (
          <>
            <Row
              label="Result"
              value={
                <StatusBadge
                  ok={lastSync.status === "completed" && lastSync.level !== "error"}
                  label={
                    lastSync.level === "error"
                      ? `Failed — ${lastSync.message ?? "unknown error"}`
                      : lastSync.status === "completed"
                        ? "Completed"
                        : lastSync.status
                  }
                />
              }
            />
            <Row label="Started" value={fmt(lastSync.startedAt)} />
            <Row label="Finished" value={fmt(lastSync.finishedAt)} />
            <Row label="Accounts found" value={lastSync.accountCount} />
            <Row label="Positions synced" value={lastSync.positionCount} />
            <Row label="Holdings rows inserted" value={lastSync.insertedHoldingsRows} />
            <Row label="Total market value" value={usd(lastSync.totalMarketValue)} />
            {lastSync.positionCount === 0 && lastSync.status === "completed" && (
              <p className="pt-2 text-xs text-amber-400">
                Sync completed but found 0 positions. The Schwab account contains only cash.
                Holdings table will populate once securities are purchased.
              </p>
            )}
          </>
        )}
      </div>

      {/* Account balances from last sync */}
      {lastSync && lastSync.accountBalances.length > 0 && (
        <div className="rounded-[10px] bg-white/[0.03] px-4 py-3 space-y-3">
          <p className="caps-label">Account Balances — Last Sync</p>
          {lastSync.accountBalances.map((acct) => (
            <div key={acct.accountNumber} className="space-y-0.5">
              <p className="text-xs text-zinc-500 mb-1">
                #{acct.accountNumber} · {acct.accountType}
              </p>
              <Row label="Liquidation value" value={usd(acct.liquidationValue)} />
              <Row label="Cash available" value={usd(acct.cashAvailableForTrading)} />
              <Row label="Long market value" value={usd(acct.longMarketValue)} />
              <Row label="Mutual fund value" value={usd(acct.mutualFundValue)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
