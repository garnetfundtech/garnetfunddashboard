"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme-colors";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn } from "@/components/dashboard/buttons";
import { StatusPill } from "@/components/dashboard/status-pill";
import { fmtPct, fmtUsd, STATUS_TEXT } from "@/components/dashboard/risk-status";
import type { RiskStatus } from "@/lib/risk-parameters";
import type { ReportingModel, PackDef, PeriodKey } from "@/lib/risk-reporting";
import { markPostMortemAction } from "@/app/(dashboard)/risk/actions";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "wtd", label: "WTD" },
  { value: "mtd", label: "MTD" },
  { value: "std", label: "Semester" },
  { value: "fytd", label: "FY" },
  { value: "inception", label: "Inception" },
];

const AXIS = { fontSize: 11, fill: THEME.ink3 } as const;

function Tile({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: RiskStatus;
}) {
  return (
    <article className="panel px-3.5 py-3">
      <p className="caps text-[11px] text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-1 text-[24px] font-semibold leading-none tabular-nums",
          status ? STATUS_TEXT[status] : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11.5px] text-ink-3">{sub}</p>}
    </article>
  );
}

function ChartFrame({
  title,
  note,
  children,
  empty,
}: {
  title: string;
  note?: string;
  children: React.ReactElement;
  empty: boolean;
}) {
  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="panel-title">{title}</p>
        {note && <p className="text-[11.5px] text-ink-3">{note}</p>}
      </div>
      <div className="h-52">
        {empty ? (
          <div className="flex h-full items-center justify-center text-[12.5px] text-ink-3">
            No stored snapshots for this period yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export function RiskReportingTab({
  report,
  period,
  onPeriodChange,
  packs,
}: {
  report: ReportingModel;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  packs: PackDef[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const { performance, risk, activity } = report;

  const volStatus: RiskStatus =
    risk.annualizedVolPct == null || risk.volCap == null
      ? "na"
      : risk.annualizedVolPct > risk.volCap
        ? "red"
        : "green";

  return (
    <div className="flex flex-col gap-3">
      {/* Period selector + packs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="caps text-[11px] text-ink-3">Period</span>
          <FilterTabs options={PERIODS} value={period} onChange={onPeriodChange} />
          <span className="text-[11.5px] text-ink-3">
            {report.from ?? "inception"} → {report.to} · {report.snapshotCount} stored snapshot
            {report.snapshotCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {packs.map((pack) => (
            <GhostBtn
              key={pack.id}
              disabled={pending === pack.id}
              onClick={() => {
                setPending(pack.id);
                window.open(`/api/risk/report?pack=${pack.id}&period=${pack.period}`, "_blank");
                setTimeout(() => setPending(null), 1200);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              {pack.title}
            </GhostBtn>
          ))}
        </div>
      </div>

      {/* §5.1 Performance */}
      <section className="flex flex-col gap-1.5">
        <h3 className="panel-title">Performance</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile
            label="NAV / AUM"
            value={fmtUsd(performance.nav, true)}
            sub={
              performance.disbursementThreshold != null && performance.nav != null
                ? performance.nav >= performance.disbursementThreshold
                  ? "Disbursement policy active (Gov. VIII.c)"
                  : `${fmtUsd(performance.disbursementThreshold, true)} disbursement threshold`
                : undefined
            }
          />
          <Tile
            label="Period return"
            value={fmtPct(performance.periodReturnPct, 2)}
            sub={`Time-weighted, ${performance.observations} trading day${performance.observations === 1 ? "" : "s"}`}
          />
          <Tile
            label="3-month T-bill"
            value={fmtPct(performance.benchmarkReturnPct, 2)}
            sub="Benchmark, same period"
          />
          <Tile
            label="Return vs benchmark"
            value={fmtPct(performance.excessReturnPct, 2)}
            status={
              performance.excessReturnPct == null ? "na" : performance.excessReturnPct >= 0 ? "green" : "red"
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <ChartFrame
            title="NAV"
            note={
              performance.disbursementThreshold != null
                ? `Reference line at the ${fmtUsd(performance.disbursementThreshold, true)} disbursement threshold`
                : undefined
            }
            empty={performance.navSeries.length < 2}
          >
            <AreaChart data={performance.navSeries} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={THEME.garnet} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={THEME.garnet} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.line} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => fmtUsd(Number(v), true)} />
              <Tooltip formatter={(v) => fmtUsd(Number(v))} contentStyle={{ fontSize: 12 }} />
              {performance.disbursementThreshold != null && (
                <ReferenceLine y={performance.disbursementThreshold} stroke={THEME.ink3} strokeDasharray="4 4" />
              )}
              <Area type="monotone" dataKey="nav" stroke={THEME.garnet} fill="url(#navGrad)" strokeWidth={1.5} />
            </AreaChart>
          </ChartFrame>

          <ChartFrame
            title="Annualized volatility"
            note={risk.volCap != null ? `Cap at ${risk.volCap}%` : undefined}
            empty={risk.volSeries.filter((v) => v.value != null).length < 2}
          >
            <LineChart data={risk.volSeries} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.line} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} unit="%" />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} contentStyle={{ fontSize: 12 }} />
              {risk.volCap != null && <ReferenceLine y={risk.volCap} stroke={THEME.neg} strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="value" stroke={THEME.ink} strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ChartFrame>
        </div>
      </section>

      {/* §5.2 Risk */}
      <section className="flex flex-col gap-1.5">
        <h3 className="panel-title">Risk</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile
            label="Annualized volatility"
            value={fmtPct(risk.annualizedVolPct, 2)}
            sub={risk.volCap != null ? `Cap ${risk.volCap}%` : "No cap set"}
            status={volStatus}
          />
          <Tile
            label="Sharpe ratio"
            value={risk.sharpe != null ? risk.sharpe.toFixed(2) : "—"}
            sub={risk.sharpeUnavailableReason ?? "vs 3-month T-bill"}
          />
          <Tile
            label="One-day 95% VaR"
            value={fmtUsd(risk.var95Dollars, true)}
            sub={`${fmtPct(risk.var95Pct, 2)} of NAV · ${risk.varObservations} observations`}
          />
          <Tile
            label="Unrealized P&L"
            value={fmtUsd(performance.unrealizedPnl, true)}
            sub={performance.pnlByTeam
              .map((t) => `${t.team === "equities" ? "Eq" : "Alt"} ${fmtUsd(t.unrealized, true)}`)
              .join(" · ")}
            status={
              performance.unrealizedPnl == null ? "na" : performance.unrealizedPnl >= 0 ? "green" : "red"
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <ChartFrame title="Net and gross exposure" note="Band 20–60% net, 100% gross cap" empty={risk.exposureSeries.length < 2}>
            <LineChart data={risk.exposureSeries} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.line} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} unit="%" />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={100} stroke={THEME.neg} strokeDasharray="4 4" />
              <ReferenceLine y={20} stroke={THEME.warn} strokeDasharray="4 4" />
              <ReferenceLine y={60} stroke={THEME.warn} strokeDasharray="4 4" />
              <Line name="Net" type="monotone" dataKey="net" stroke={THEME.garnet} strokeWidth={1.5} dot={false} connectNulls />
              <Line name="Gross" type="monotone" dataKey="gross" stroke={THEME.ink} strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ChartFrame>

          <ChartFrame title="Allocation vs the 75/25 targets" empty={risk.allocationSeries.length < 2}>
            <LineChart data={risk.allocationSeries} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.line} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} unit="%" />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={75} stroke={THEME.ink3} strokeDasharray="4 4" />
              <ReferenceLine y={25} stroke={THEME.ink3} strokeDasharray="4 4" />
              <Line name="Equities" type="monotone" dataKey="equities" stroke={THEME.garnet} strokeWidth={1.5} dot={false} connectNulls />
              <Line name="Alternatives" type="monotone" dataKey="alternatives" stroke={THEME.info} strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ChartFrame>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <TableShell
            title="Sector allocation"
            count={risk.sectors.length}
            footer={risk.sectorCap != null ? `Gross cap ${risk.sectorCap}% of NAV, Equities book only.` : undefined}
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
                {risk.sectors.map((s) => (
                  <tr key={s.sector} className="border-b border-line last:border-b-0">
                    <td className="px-2.5 py-1.5 text-[13px] text-ink">{s.sector}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(s.longPct)}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(s.shortPct)}</td>
                    <td
                      className={cn(
                        "px-2.5 py-1.5 text-right num text-[13px] font-medium",
                        risk.sectorCap != null && s.grossPct > risk.sectorCap ? "text-neg" : "text-ink",
                      )}
                    >
                      {fmtPct(s.grossPct)}
                    </td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(s.netPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell title="Asset class allocation" count={risk.assetClasses.length}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="px-2.5 py-1.5 font-medium">Asset class</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">% of NAV</th>
                </tr>
              </thead>
              <tbody>
                {risk.assetClasses.map((a) => (
                  <tr key={a.assetClass} className="border-b border-line last:border-b-0">
                    <td className="px-2.5 py-1.5 text-[13px] text-ink">{a.assetClass}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(a.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      </section>

      {/* §5.3 Activity and compliance */}
      <section className="flex flex-col gap-1.5">
        <h3 className="panel-title">Activity and compliance</h3>

        <TableShell
          title="Portfolio changes"
          count={activity.changes.length}
          footer="New acquisitions and divestitures for the Advisory Board report [Gov. IV.a]."
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                <th className="px-2.5 py-1.5 font-medium">Security</th>
                <th className="px-2.5 py-1.5 font-medium">Change</th>
                <th className="px-2.5 py-1.5 text-right font-medium">From</th>
                <th className="px-2.5 py-1.5 text-right font-medium">To</th>
                <th className="px-2.5 py-1.5 font-medium">Approved</th>
              </tr>
            </thead>
            <tbody>
              {activity.changes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[13px] text-ink-3">
                    No portfolio changes over this period.
                  </td>
                </tr>
              )}
              {activity.changes.map((c) => (
                <tr key={c.symbol} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-[13px] font-medium text-ink">{c.symbol}</td>
                  <td className="px-2.5 py-1.5">
                    <StatusPill
                      label={c.change}
                      tone={c.change === "opened" ? "emerald" : c.change === "closed" ? "rose" : "amber"}
                      dot={false}
                    />
                  </td>
                  <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(c.from)}</td>
                  <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{fmtPct(c.to)}</td>
                  <td className="px-2.5 py-1.5 text-[12.5px] text-ink-3">
                    {c.approvalDate ? `${c.approvalDate}${c.approvedBy ? ` · ${c.approvedBy}` : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        <TableShell
          title="Stop-loss events"
          count={activity.stopLossEvents.length}
          footer="Each of these requires a Senior Analyst post-mortem [IPS V.a]."
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                <th className="px-2.5 py-1.5 font-medium">Detected</th>
                <th className="px-2.5 py-1.5 font-medium">Security</th>
                <th className="px-2.5 py-1.5 font-medium">Side</th>
                <th className="px-2.5 py-1.5 text-right font-medium">Realized loss</th>
                <th className="px-2.5 py-1.5 text-right font-medium">vs cost</th>
                <th className="px-2.5 py-1.5 font-medium">Post-mortem</th>
              </tr>
            </thead>
            <tbody>
              {activity.stopLossEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[13px] text-ink-3">
                    No stops fired over this period.
                  </td>
                </tr>
              )}
              {activity.stopLossEvents.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-[12.5px] text-ink-3">
                    {new Date(e.detected_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-2.5 py-1.5 text-[13px] font-medium text-ink">{e.symbol}</td>
                  <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2">{e.side ?? "—"}</td>
                  <td className="px-2.5 py-1.5 text-right num text-[13px] text-neg">{fmtUsd(e.realized_loss)}</td>
                  <td className="px-2.5 py-1.5 text-right num text-[13px] text-neg">{fmtPct(e.pnl_pct)}</td>
                  <td className="px-2.5 py-1.5">
                    {e.post_mortem_delivered ? (
                      <StatusPill label="Delivered" tone="emerald" dot={false} />
                    ) : (
                      <form action={markPostMortemAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="text-[12.5px] text-warn underline">
                          Mark delivered
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <TableShell
            title="Alert summary"
            count={activity.alertSummary.length}
            footer="Red and yellow episodes by monitor, and days spent outside each limit."
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="px-2.5 py-1.5 font-medium">Monitor</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Red</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Yellow</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Days outside</th>
                </tr>
              </thead>
              <tbody>
                {activity.alertSummary.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-[13px] text-ink-3">
                      No alert episodes over this period.
                    </td>
                  </tr>
                )}
                {activity.alertSummary.map((row) => (
                  <tr key={row.monitorId} className="border-b border-line last:border-b-0">
                    <td className="px-2.5 py-1.5 text-[13px] text-ink">{row.label}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-neg">{row.red}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-warn">{row.yellow}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{row.daysOutside}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Limit compliance"
            count={activity.limitCompliance.length}
            footer="The adherence-to-risk-profile check [Gov. V.b]."
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="px-2.5 py-1.5 font-medium">Limit</th>
                  <th className="px-2.5 py-1.5 font-medium">Breached</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Days</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Max excursion</th>
                </tr>
              </thead>
              <tbody>
                {activity.limitCompliance.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-[13px] text-pos">
                      Every limit stayed inside policy over this period.
                    </td>
                  </tr>
                )}
                {activity.limitCompliance.map((row) => (
                  <tr key={row.monitorId} className="border-b border-line last:border-b-0">
                    <td className="px-2.5 py-1.5 text-[13px] text-ink">{row.label}</td>
                    <td className={cn("px-2.5 py-1.5 text-[12.5px]", row.breached ? "text-neg" : "text-pos")}>
                      {row.breached ? "Yes" : "No"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">{row.daysOutside}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">
                      {row.maxExcursion != null ? row.maxExcursion.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <TableShell title="Gain reviews" count={activity.gainReviews.length} footer="Routed to the Investment Committee [IPS V.a].">
            <table className="w-full">
              <tbody>
                {activity.gainReviews.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-[13px] text-ink-3">Nothing outstanding.</td>
                  </tr>
                )}
                {activity.gainReviews.map((g) => (
                  <tr key={g.symbol} className="border-b border-line last:border-b-0">
                    <td className="px-2.5 py-1.5 text-[13px] font-medium text-ink">{g.symbol}</td>
                    <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2">{g.reason}</td>
                    <td className="px-2.5 py-1.5 text-right num text-[13px] text-ink-2">
                      {fmtUsd(g.price)}
                      {g.target != null && <span className="ml-1 text-[11px] text-ink-3">tgt {fmtUsd(g.target)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <section className="panel flex flex-col gap-1.5 p-3">
            <p className="panel-title">Trading calendar compliance</p>
            {activity.blackoutWindow ? (
              <p
                className={cn(
                  "text-[13px]",
                  activity.blackoutTrades === 0 ? "text-pos" : activity.blackoutTrades == null ? "text-ink-3" : "text-neg",
                )}
              >
                {activity.blackoutTrades === 0
                  ? `Confirmed: no trades occurred between ${activity.blackoutWindow.start} and ${activity.blackoutWindow.end}.`
                  : `${activity.blackoutTrades} trade(s) detected inside the blackout (${activity.blackoutWindow.start} → ${activity.blackoutWindow.end}).`}
              </p>
            ) : (
              <p className="text-[13px] text-ink-3">
                No blackout window is configured for this academic year, so no confirmation can be given. Set the
                dates in Risk Admin.
              </p>
            )}
            <p className="mt-auto text-[11.5px] text-ink-3">Gov. VIII.c</p>
          </section>
        </div>
      </section>
    </div>
  );
}
