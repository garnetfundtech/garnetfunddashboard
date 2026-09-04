"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Download, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn } from "@/components/dashboard/buttons";
import { InfoTooltip } from "@/components/ui/tooltip";
import {
  AsOf,
  Cell,
  StaleTag,
  StatusDot,
  STATUS_TEXT,
  STATUS_VAR,
  fmtPct,
  fmtUsd,
} from "@/components/dashboard/risk-status";
import { NOTIFY_RECIPIENTS, type RiskStatus } from "@/lib/risk-parameters";
import type { MonitorRow, PositionRow, RiskModel, SectorRow } from "@/lib/risk-engine";
import type { AlertLogRow } from "@/lib/risk-episodes";
import { acknowledgeEpisodeAction, confirmAllocationBreachAction } from "@/app/(dashboard)/risk/actions";

// ── §4.1 Portfolio-level limit strip ──────────────────────────────────────

function MonitorCard({ row, asOf }: { row: MonitorRow; asOf: string | null }) {
  return (
    <article className="panel relative flex flex-col overflow-hidden px-3.5 py-3">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{ background: STATUS_VAR[row.status] }}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="caps text-[11px] text-ink-3">{row.monitor.label}</p>
        {row.stale ? <StaleTag /> : <StatusDot status={row.status} />}
      </div>

      <p className={cn("mt-1.5 text-[27px] font-semibold leading-none tabular-nums", STATUS_TEXT[row.status])}>
        {row.stale ? "—" : row.display}
      </p>

      <p className="mt-1.5 text-[12px] text-ink-3">
        <span className="text-ink-2">Limit</span> {row.limitText}
      </p>
      {row.detail && <p className="mt-0.5 text-[11.5px] text-ink-3">{row.detail}</p>}

      {row.degradedReason && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] text-warn">
          <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
          <span>{row.degradedReason}</span>
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <AsOf iso={asOf} />
        <InfoTooltip
          text={[
            row.monitor.calculation,
            row.monitor.note,
            `Source: ${row.monitor.source}.`,
            row.monitor.notify === "none"
              ? "No red tier, so this never notifies."
              : `On red: ${NOTIFY_RECIPIENTS[row.monitor.notify].join(", ")} — ${
                  row.monitor.timing === "intraday" ? "immediately" : "close of day"
                }.`,
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </div>
    </article>
  );
}

function LimitStrip({ model }: { model: RiskModel }) {
  return (
    <div className="flex flex-col gap-3">
      {model.monitors.map((group) => (
        <section key={group.group} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <h3 className="panel-title">{group.label}</h3>
            <p className="text-[12px] text-ink-3">{group.blurb}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {group.rows.map((row) => (
              <MonitorCard key={row.monitor.id} row={row} asOf={model.navAsOf} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Sector breakdown ──────────────────────────────────────────────────────

function SectorTable({ sectors, cap }: { sectors: SectorRow[]; cap: number | null }) {
  return (
    <TableShell
      title="Sector exposure — Equities book"
      count={sectors.length}
      footer={
        cap != null
          ? `Cap is ${cap}% of NAV on gross exposure per sector. Net exposure is shown for information and is not limited.`
          : "No sector cap is configured."
      }
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
            <th className="px-2.5 py-1.5 font-medium">Sector</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Long</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Short</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Gross</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => {
            const status: RiskStatus =
              cap == null ? "na" : s.grossPct > cap ? "red" : s.grossPct >= cap * 0.8 ? "yellow" : "green";
            return (
              <tr key={s.sector} className="border-b border-line last:border-b-0">
                <td className="px-2.5 py-1.5 text-[13px] text-ink">{s.sector}</td>
                <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(s.longPct)}</td>
                <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(s.shortPct)}</td>
                <td className={cn("px-2.5 py-1.5 text-right num text-[13px] font-medium", STATUS_TEXT[status])}>
                  {fmtPct(s.grossPct)}
                </td>
                <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(s.netPct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}

/** §4.2 holding period — display only, from the entry date the stored record
 *  reconstructs (see lib/risk-history.ts). */
function holdingDays(entryDate: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(entryDate).getTime()) / 86_400_000));
}

// ── §4.2 Position table ───────────────────────────────────────────────────

type TeamFilter = "All" | "Equities" | "Alternatives";
type StateFilter = "All" | "Breached" | "Approaching";
type SideFilter = "All" | "Long" | "Short";

function PositionTable({
  model,
  canEdit,
  fullBoard,
  onEdit,
}: {
  model: RiskModel;
  canEdit: boolean;
  fullBoard: boolean;
  onEdit: (row: PositionRow | null) => void;
}) {
  const [team, setTeam] = useState<TeamFilter>("All");
  const [state, setState] = useState<StateFilter>("All");
  const [side, setSide] = useState<SideFilter>("All");
  const [sector, setSector] = useState<string>("All");

  const sectors = useMemo(
    () => ["All", ...new Set(model.positions.map((r) => r.position.sector))],
    [model.positions],
  );

  const rows = model.positions.filter((r) => {
    if (team !== "All" && r.position.team !== team.toLowerCase()) return false;
    if (side !== "All" && r.position.side !== side.toLowerCase()) return false;
    if (sector !== "All" && r.position.sector !== sector) return false;
    if (state === "Breached" && r.worst !== "red") return false;
    if (state === "Approaching" && r.worst !== "yellow") return false;
    return true;
  });

  return (
    <TableShell
      title="Positions"
      count={rows.length}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterTabs options={["All", "Equities", "Alternatives"] as TeamFilter[]} value={team} onChange={setTeam} />
          <FilterTabs options={["All", "Long", "Short"] as SideFilter[]} value={side} onChange={setSide} />
          <FilterTabs options={["All", "Breached", "Approaching"] as StateFilter[]} value={state} onChange={setState} />
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="h-[26px] border border-line bg-paper-3 px-1.5 text-[12px] text-ink"
          >
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {canEdit && (
            <GhostBtn onClick={() => onEdit(null)}>
              <Plus className="h-3.5 w-3.5" />
              Approval
            </GhostBtn>
          )}
        </div>
      }
      footer="A stopped position pins to the top. A dash means the column is display only and carries no alert. Held is days since entry, reconstructed from the stored daily snapshots."
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
            <th className="px-2.5 py-1.5 font-medium">Ticker</th>
            <th className="px-2.5 py-1.5 font-medium">Side</th>
            <th className="px-2.5 py-1.5 font-medium">Team</th>
            <th className="px-2.5 py-1.5 font-medium">Class</th>
            <th className="px-2.5 py-1.5 font-medium">Sector</th>
            <th className="px-2.5 py-1.5 font-medium">Analyst</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Qty</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Price</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Market value</th>
            <th className="px-2.5 py-1.5 text-right font-medium">% NAV</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Approved</th>
            <th className="px-2.5 py-1.5 text-right font-medium">P&amp;L vs cost</th>
            <th className="px-2.5 py-1.5 font-medium">Stop order</th>
            <th className="px-2.5 py-1.5 font-medium">Stop-loss</th>
            <th className="px-2.5 py-1.5 text-right font-medium">VaR share</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Target</th>
            <th className="px-2.5 py-1.5 text-right font-medium">DTE</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Max loss</th>
            <th className="px-2.5 py-1.5 font-medium">Maturity</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Held</th>
            {canEdit && <th className="px-2.5 py-1.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 21 : 20} className="px-3 py-12 text-center text-[13.5px] text-ink-3">
                {!model.hasLiveData
                  ? "No live position data."
                  : model.positions.length === 0 && !fullBoard
                    ? // An analyst is scoped to the positions naming them, so
                      // an empty table means no approval names them yet —
                      // not that the feed is down.
                      "No positions are assigned to you yet. The Risk Manager assigns an analyst when recording a position approval [IPS IV.c step 6]."
                    : "No positions match these filters."}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const p = row.position;
            const sizeRule = p.side === "long" ? row.rules["long-size"] : row.rules["short-size"];
            return (
              <tr
                key={p.symbol}
                className={cn(
                  "border-b border-line last:border-b-0",
                  row.stopped && "bg-neg-soft",
                )}
              >
                <td className="px-2.5 py-1.5">
                  <span className="text-[13px] font-medium text-ink">{p.symbol}</span>
                  <span className="ml-1.5 text-[11.5px] text-ink-3">{p.name}</span>
                </td>
                <td className={cn("px-2.5 py-1.5 text-[12.5px]", p.side === "long" ? "text-pos" : "text-neg")}>
                  {p.side}
                </td>
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2 capitalize">{p.team}</td>
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2">{p.assetClass}</td>
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2">{p.sector}</td>
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2">
                  {p.approval?.analyst_name ?? <span className="text-ink-3">unassigned</span>}
                </td>
                <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">
                  {p.quantity.toLocaleString("en-US")}
                </td>
                <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtUsd(p.price)}</td>
                <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtUsd(p.marketValue, true)}</td>
                <Cell status={sizeRule.status} className="text-right font-medium">
                  {sizeRule.display}
                </Cell>
                <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-3">
                  {p.approval?.approved_size_pct != null ? `${p.approval.approved_size_pct}%` : "—"}
                </td>
                <Cell status={row.rules["pnl-vs-cost"].status} className="text-right">
                  {row.rules["pnl-vs-cost"].display}
                </Cell>
                <Cell status={row.rules["stop-order-present"].status}>
                  {row.rules["stop-order-present"].display}
                  {row.stop.expected != null && row.rules["stop-order-present"].status === "red" && (
                    <span className="ml-1 text-[11px] text-ink-3">exp. {fmtUsd(row.stop.expected)}</span>
                  )}
                </Cell>
                <Cell status={row.rules["stop-loss-status"].status}>
                  {row.stopped ? <span className="font-semibold">STOPPED</span> : row.rules["stop-loss-status"].display}
                </Cell>
                <Cell status={row.rules["position-var-share"].status} className="text-right">
                  {row.rules["position-var-share"].display}
                </Cell>
                <Cell status={row.rules["price-target"].status} className="text-right">
                  {row.rules["price-target"].display}
                </Cell>
                <Cell status={row.rules["days-to-expiry"].status} className="text-right">
                  {row.rules["days-to-expiry"].display}
                </Cell>
                <Cell status={row.rules["defined-risk-max-loss"].status} className="text-right">
                  {row.rules["defined-risk-max-loss"].display}
                </Cell>
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-3">{p.maturityDate ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-right text-[12.5px] text-ink-3">
                  {p.entryDate ? (
                    <span title={`Entered ${p.entryDate}`}>{holdingDays(p.entryDate)}d</span>
                  ) : (
                    "—"
                  )}
                </td>
                {canEdit && (
                  <td className="px-2.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => onEdit(row)}
                      className="text-ink-3 transition-colors hover:text-ink"
                      aria-label={`Edit approval for ${p.symbol}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}

// ── §4.3 Alert log ────────────────────────────────────────────────────────

function AlertLog({ rows, canEdit }: { rows: AlertLogRow[]; canEdit: boolean }) {
  const [acking, setAcking] = useState<string | null>(null);
  const open = rows.filter((r) => !r.closed_at).length;

  return (
    <TableShell
      title="Alert log"
      count={rows.length}
      actions={
        <GhostBtn onClick={() => window.open("/api/risk/alert-log/export", "_blank")}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </GhostBtn>
      }
      footer={`${open} open episode${open === 1 ? "" : "s"}. One row per episode: a limit that stays red for ten days is one row, not ten. This is the compliance record Gov. IV.a and IV.b require.`}
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
            <th className="px-2.5 py-1.5 font-medium">Opened</th>
            <th className="px-2.5 py-1.5 font-medium">Monitor</th>
            <th className="px-2.5 py-1.5 font-medium">Position</th>
            <th className="px-2.5 py-1.5 font-medium">State</th>
            <th className="px-2.5 py-1.5 text-right font-medium">At trigger</th>
            <th className="px-2.5 py-1.5 font-medium">Threshold</th>
            <th className="px-2.5 py-1.5 font-medium">Notified</th>
            <th className="px-2.5 py-1.5 font-medium">Closed</th>
            <th className="px-2.5 py-1.5 font-medium">Acknowledgement</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-12 text-center text-[13.5px] text-ink-3">
                No alert episodes yet.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line align-top last:border-b-0">
              <td className="px-2.5 py-1.5 text-[12.5px] text-ink-3">
                {new Date(row.opened_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-2.5 py-1.5 text-[13px] text-ink">{row.monitor_label}</td>
              <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2">{row.subject ?? "—"}</td>
              <td className={cn("px-2.5 py-1.5 text-[12.5px] font-medium uppercase", STATUS_TEXT[row.status])}>
                {row.status}
              </td>
              <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">
                {row.value_at_trigger != null ? row.value_at_trigger.toFixed(2) : "—"}
                {row.peak_value != null && row.peak_value !== row.value_at_trigger && (
                  <span className="ml-1 text-[11px] text-ink-3">peak {row.peak_value.toFixed(2)}</span>
                )}
              </td>
              <td className="px-2.5 py-1.5 text-[12px] text-ink-3">{row.threshold ?? "—"}</td>
              <td className="px-2.5 py-1.5 text-[12px] text-ink-3">
                {row.notified?.length ? row.notified.join(", ") : row.status === "yellow" ? "no one (yellow)" : "—"}
              </td>
              <td className="px-2.5 py-1.5 text-[12.5px] text-ink-3">
                {row.closed_at
                  ? new Date(row.closed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : <span className="text-warn">open</span>}
              </td>
              <td className="px-2.5 py-1.5">
                {row.acknowledged_at ? (
                  <div className="flex items-start gap-1 text-[12px] text-ink-3">
                    <Check className="mt-[2px] h-3 w-3 shrink-0 text-pos" />
                    <span>{row.resolution_note || "Acknowledged"}</span>
                  </div>
                ) : !canEdit ? (
                  <span className="text-[12px] text-ink-3">—</span>
                ) : acking === row.id ? (
                  <form action={acknowledgeEpisodeAction} className="flex flex-col gap-1">
                    <input type="hidden" name="id" value={row.id} />
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="What happened, and what was done"
                      className="w-56 border border-line bg-surface px-2 py-1 text-[12.5px] text-ink"
                    />
                    <div className="flex items-center gap-2">
                      <button type="submit" className="text-[12.5px] text-pos underline">
                        Acknowledge
                      </button>
                      {row.monitor_id === "equities-allocation" && (
                        <button
                          type="submit"
                          formAction={confirmAllocationBreachAction}
                          className="text-[12.5px] text-neg underline"
                          title="IPS VIII.b: notifies the President and Faculty Advisor once the Risk Manager confirms the breach"
                        >
                          Confirm &amp; escalate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAcking(null)}
                        className="text-[12px] text-ink-3 underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAcking(row.id)}
                    className="text-[12.5px] text-ink-3 underline hover:text-ink"
                  >
                    Acknowledge
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────

export function RiskAlertsTab({
  model,
  alertLog,
  canEdit,
  fullBoard,
  onEditApproval,
}: {
  model: RiskModel;
  alertLog: AlertLogRow[];
  canEdit: boolean;
  fullBoard: boolean;
  onEditApproval: (row: PositionRow | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* The limit strip, sector breakdown and alert log are fund-wide, so
          they belong to the roles with the full board [Spec §6]. */}
      {fullBoard && <LimitStrip model={model} />}
      <PositionTable model={model} canEdit={canEdit} fullBoard={fullBoard} onEdit={onEditApproval} />
      {fullBoard && <SectorTable sectors={model.sectors} cap={model.config.values.sector_cap} />}
      {fullBoard && <AlertLog rows={alertLog} canEdit={canEdit} />}
    </div>
  );
}
