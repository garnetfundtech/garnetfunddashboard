/**
 * Tab 2 — Fund Reporting Metrics (§5).
 *
 * This is the export view: the numbers that go into the weekly report to the
 * Equities PM, the monthly report to the President, and the semester and
 * semi-annual reports to the Advisory Board.
 *
 * Everything reads from stored daily snapshots rather than live feeds, per §6
 * Storage: "Reports for the Advisory Board and the academic year may be
 * audited, so historical figures must be reproducible from stored data, not
 * recomputed from live feeds." The one exception is the current day, which is
 * taken from the live model so Tab 2 agrees with Tab 1 — the acceptance
 * checklist requires exactly that.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { cfg, type RiskConfig } from "@/lib/risk-config";
import {
  PERIOD_LABEL,
  annualizedVolatility,
  benchmarkReturn,
  chainLink,
  periodStart,
  sharpeRatio,
  sliceSeries,
  type NavSeries,
  type PeriodKey,
} from "@/lib/risk-nav";
import type { RiskModel, SectorRow } from "@/lib/risk-engine";
import type { AlertLogRow } from "@/lib/risk-episodes";
import { monitorLabel } from "@/lib/risk-episodes";

export type { PeriodKey };
export { PERIOD_LABEL };

export type SnapshotRow = {
  captured_on: string;
  nav: number | null;
  net_pct: number | null;
  gross_pct: number | null;
  equities_pct: number | null;
  alternatives_pct: number | null;
  annualized_vol: number | null;
  var_95_pct: number | null;
  var_95_dollars: number | null;
  max_sector_pct: number | null;
  sector_exposure: SectorRow[] | null;
  red_count: number | null;
  yellow_count: number | null;
};

export type StopLossEvent = {
  id: string;
  symbol: string;
  detected_at: string;
  side: string | null;
  realized_loss: number | null;
  pnl_pct: number | null;
  post_mortem_delivered: boolean;
};

export type PortfolioChange = {
  symbol: string;
  change: "opened" | "closed" | "resized";
  from: number | null;
  to: number | null;
  approvalDate: string | null;
  approvedBy: string | null;
};

// ── §5.1 Performance ──────────────────────────────────────────────────────

export type PerformanceMetrics = {
  nav: number | null;
  navSeries: { date: string; nav: number }[];
  disbursementThreshold: number | null;
  /** Time-weighted, net of costs, external flows removed [§6 Returns]. */
  periodReturnPct: number | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  pnlByTeam: { team: string; unrealized: number }[];
  observations: number;
};

// ── §5.2 Risk ─────────────────────────────────────────────────────────────

export type RiskMetrics = {
  annualizedVolPct: number | null;
  volCap: number | null;
  volSeries: { date: string; value: number | null }[];
  sharpe: number | null;
  sharpeUnavailableReason: string | null;
  var95Dollars: number | null;
  var95Pct: number | null;
  varObservations: number;
  exposureSeries: { date: string; net: number | null; gross: number | null }[];
  allocationSeries: { date: string; equities: number | null; alternatives: number | null }[];
  sectors: SectorRow[];
  sectorCap: number | null;
  assetClasses: { assetClass: string; pct: number }[];
};

// ── §5.3 Activity and compliance ──────────────────────────────────────────

export type LimitComplianceRow = {
  monitorId: string;
  label: string;
  breached: boolean;
  daysOutside: number;
  maxExcursion: number | null;
};

export type ActivityMetrics = {
  changes: PortfolioChange[];
  stopLossEvents: StopLossEvent[];
  gainReviews: { symbol: string; reason: string; price: number; target: number | null }[];
  alertSummary: { monitorId: string; label: string; red: number; yellow: number; daysOutside: number }[];
  limitCompliance: LimitComplianceRow[];
  blackoutTrades: number | null;
  blackoutWindow: { start: string; end: string } | null;
};

export type ReportingModel = {
  period: PeriodKey;
  periodLabel: string;
  from: string | null;
  to: string;
  generatedAt: string;
  performance: PerformanceMetrics;
  risk: RiskMetrics;
  activity: ActivityMetrics;
  /** Snapshots the period is built from — the audit trail for every figure. */
  snapshotCount: number;
};

const DAY_MS = 86_400_000;

async function loadSnapshots(from: string | null): Promise<SnapshotRow[]> {
  try {
    const admin = createAdminClient();
    let query = admin
      .from("risk_snapshots")
      .select(
        "captured_on, nav, net_pct, gross_pct, equities_pct, alternatives_pct, annualized_vol, var_95_pct, var_95_dollars, max_sector_pct, sector_exposure, red_count, yellow_count",
      )
      .order("captured_on", { ascending: true });
    if (from) query = query.gte("captured_on", from);
    const { data } = await query;
    return (data ?? []) as SnapshotRow[];
  } catch {
    return [];
  }
}

async function loadStopLossEvents(from: string | null): Promise<StopLossEvent[]> {
  try {
    const admin = createAdminClient();
    let query = admin
      .from("stop_loss_events")
      .select("id, symbol, detected_at, side, realized_loss, pnl_pct, post_mortem_delivered")
      .order("detected_at", { ascending: false });
    if (from) query = query.gte("detected_at", `${from}T00:00:00Z`);
    const { data } = await query;
    return (data ?? []) as StopLossEvent[];
  } catch {
    return [];
  }
}

/**
 * §5.3 Portfolio changes: new positions opened, positions closed, and size
 * changes over the period. Derived by diffing the first and last stored
 * snapshot's position lists, because that is the only record that survives an
 * audit — a live diff would silently miss a position opened and closed inside
 * the same period.
 */
async function loadPortfolioChanges(from: string | null): Promise<PortfolioChange[]> {
  try {
    const admin = createAdminClient();
    let query = admin
      .from("risk_snapshots")
      .select("captured_on, positions")
      .not("positions", "is", null)
      .order("captured_on", { ascending: true });
    if (from) query = query.gte("captured_on", from);
    const { data } = await query;
    const rows = (data ?? []) as { captured_on: string; positions: { symbol?: string; ticker?: string; weightPct?: number; weight?: number }[] }[];
    if (rows.length < 2) return [];

    const symbolOf = (p: { symbol?: string; ticker?: string }) => p.symbol ?? p.ticker ?? "";
    const weightOf = (p: { weightPct?: number; weight?: number }) => p.weightPct ?? p.weight ?? 0;

    const first = new Map(rows[0].positions.map((p) => [symbolOf(p), weightOf(p)]));
    const last = new Map(rows[rows.length - 1].positions.map((p) => [symbolOf(p), weightOf(p)]));

    // A position that came and went inside the period appears in neither end
    // point, so every intermediate snapshot is scanned for arrivals too.
    const everSeen = new Set<string>();
    for (const row of rows) for (const p of row.positions) everSeen.add(symbolOf(p));

    const changes: PortfolioChange[] = [];
    for (const symbol of everSeen) {
      if (!symbol) continue;
      const start = first.get(symbol) ?? null;
      const end = last.get(symbol) ?? null;
      if (start == null && end != null) changes.push({ symbol, change: "opened", from: null, to: end, approvalDate: null, approvedBy: null });
      else if (start != null && end == null) changes.push({ symbol, change: "closed", from: start, to: null, approvalDate: null, approvedBy: null });
      else if (start != null && end != null && Math.abs(start - end) >= 0.5) {
        changes.push({ symbol, change: "resized", from: start, to: end, approvalDate: null, approvedBy: null });
      }
    }

    // Attach the approval record so the Advisory Board section can show who
    // approved each change and when [Gov. IV.a].
    const symbols = changes.map((c) => c.symbol);
    if (symbols.length) {
      const { data: approvals } = await admin
        .from("position_approvals")
        .select("symbol, approval_date, approved_by")
        .in("symbol", symbols);
      const byId = new Map<string, string>();
      const approverIds = [...new Set((approvals ?? []).map((a) => a.approved_by).filter(Boolean))] as string[];
      if (approverIds.length) {
        const { data: people } = await admin.from("user_profiles").select("id, full_name, email").in("id", approverIds);
        for (const p of people ?? []) byId.set(p.id, (p.full_name as string | null) ?? (p.email as string));
      }
      const map = new Map((approvals ?? []).map((a) => [a.symbol as string, a]));
      for (const change of changes) {
        const a = map.get(change.symbol);
        if (!a) continue;
        change.approvalDate = (a.approval_date as string | null) ?? null;
        change.approvedBy = a.approved_by ? (byId.get(a.approved_by as string) ?? null) : null;
      }
    }

    return changes.sort((a, b) => a.symbol.localeCompare(b.symbol));
  } catch {
    return [];
  }
}

/**
 * §5.3 Alert summary and limit compliance: count of red and yellow episodes by
 * monitor over the period, days spent outside each limit, and the maximum
 * excursion. Built from the alert log, which is the compliance record itself.
 */
function summarizeAlerts(log: AlertLogRow[], to: string): {
  summary: ActivityMetrics["alertSummary"];
  compliance: LimitComplianceRow[];
} {
  const byMonitor = new Map<string, { red: number; yellow: number; days: number; peak: number | null }>();
  const end = new Date(`${to}T23:59:59Z`).getTime();

  for (const row of log) {
    const entry = byMonitor.get(row.monitor_id) ?? { red: 0, yellow: 0, days: 0, peak: null };
    if (row.status === "red") entry.red++;
    else entry.yellow++;

    const opened = new Date(row.opened_at).getTime();
    const closed = row.closed_at ? new Date(row.closed_at).getTime() : end;
    // An episode open for part of a day still counts as a day outside — the
    // limit was breached that day, and the Governance check asks how many days.
    entry.days += Math.max(1, Math.round((closed - opened) / DAY_MS));

    if (row.peak_value != null) {
      entry.peak =
        entry.peak == null || Math.abs(row.peak_value) > Math.abs(entry.peak) ? row.peak_value : entry.peak;
    }
    byMonitor.set(row.monitor_id, entry);
  }

  const summary = [...byMonitor.entries()]
    .map(([monitorId, v]) => ({
      monitorId,
      label: monitorLabel(monitorId),
      red: v.red,
      yellow: v.yellow,
      daysOutside: v.days,
    }))
    .sort((a, b) => b.red - a.red || b.yellow - a.yellow);

  const compliance = [...byMonitor.entries()]
    .map(([monitorId, v]) => ({
      monitorId,
      label: monitorLabel(monitorId),
      breached: v.red > 0,
      daysOutside: v.days,
      maxExcursion: v.peak,
    }))
    .sort((a, b) => Number(b.breached) - Number(a.breached) || b.daysOutside - a.daysOutside);

  return { summary, compliance };
}

/**
 * Builds the whole of Tab 2 for one period.
 *
 * `model` is today's live board. Every metric it contributes is the same
 * calculation Tab 1 shows, from the same code — which is how the acceptance
 * checklist item "every metric on Tab 2 reproduces the same value on Tab 1 for
 * the same date" is satisfied by construction rather than by coincidence.
 */
export async function buildReportingModel(params: {
  period: PeriodKey;
  model: RiskModel;
  navSeries: NavSeries;
  alertLog: AlertLogRow[];
  config: RiskConfig;
  riskFreePct: number | null;
  today?: Date;
}): Promise<ReportingModel> {
  const { period, model, navSeries, alertLog, config, riskFreePct } = params;
  const today = params.today ?? new Date();
  const to = today.toISOString().slice(0, 10);
  const from = periodStart(period, today);

  const [snapshots, stopLossEvents, changes] = await Promise.all([
    loadSnapshots(from),
    loadStopLossEvents(from),
    loadPortfolioChanges(from),
  ]);

  const windowed = sliceSeries(navSeries, from);
  const periodReturnPct = chainLink(windowed.returns);
  const bench = benchmarkReturn(riskFreePct, windowed.returns.length);

  // ── Performance ────────────────────────────────────────────────────────
  const performance: PerformanceMetrics = {
    nav: model.nav,
    navSeries: navSeries.points
      .filter((p) => !from || p.captured_on >= from)
      .map((p) => ({ date: p.captured_on, nav: Number(p.nav) })),
    disbursementThreshold: cfg(config, "disbursement_threshold"),
    periodReturnPct,
    benchmarkReturnPct: bench,
    excessReturnPct: periodReturnPct != null && bench != null ? periodReturnPct - bench : null,
    unrealizedPnl: model.positions.reduce((s, r) => s + r.position.unrealizedPnl, 0),
    realizedPnl: null,
    pnlByTeam: ["equities", "alternatives"].map((team) => ({
      team,
      unrealized: model.positions
        .filter((r) => r.position.team === team)
        .reduce((s, r) => s + r.position.unrealizedPnl, 0),
    })),
    observations: windowed.observations,
  };

  // ── Risk ───────────────────────────────────────────────────────────────
  const volWindow = cfg(config, "volatility_window_days") ?? 60;
  const minObs = cfg(config, "sharpe_min_observations") ?? 60;
  const vol = annualizedVolatility(navSeries.returns, volWindow);
  const sharpe = sharpeRatio(navSeries.returns, riskFreePct, minObs);

  const assetTotals = new Map<string, number>();
  for (const row of model.positions) {
    const key = row.position.assetClass;
    assetTotals.set(key, (assetTotals.get(key) ?? 0) + Math.abs(row.position.exposure));
  }
  if (model.exposure && model.nav) {
    assetTotals.set("Cash", (model.exposure.cashPct / 100) * model.nav);
  }

  const risk: RiskMetrics = {
    annualizedVolPct: vol.value,
    volCap: cfg(config, "volatility_cap"),
    volSeries: snapshots.map((s) => ({ date: s.captured_on, value: s.annualized_vol })),
    sharpe,
    sharpeUnavailableReason:
      sharpe == null
        ? navSeries.returns.length < minObs
          ? `Needs ${minObs} daily observations; ${navSeries.returns.length} on file.`
          : riskFreePct == null
            ? "The 3-month T-bill yield is unavailable."
            : "Volatility is zero over the window."
        : null,
    var95Dollars: model.fundVar?.dollars ?? null,
    var95Pct: model.fundVar?.pct ?? null,
    varObservations: model.fundVar?.observations ?? 0,
    exposureSeries: snapshots.map((s) => ({ date: s.captured_on, net: s.net_pct, gross: s.gross_pct })),
    allocationSeries: snapshots.map((s) => ({
      date: s.captured_on,
      equities: s.equities_pct,
      alternatives: s.alternatives_pct,
    })),
    sectors: model.sectors,
    sectorCap: cfg(config, "sector_cap"),
    assetClasses: [...assetTotals.entries()]
      .map(([assetClass, dollars]) => ({
        assetClass,
        pct: model.nav && model.nav > 0 ? (dollars / model.nav) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct),
  };

  // ── Activity and compliance ────────────────────────────────────────────
  const scoped = from ? alertLog.filter((r) => r.opened_at.slice(0, 10) >= from) : alertLog;
  const { summary, compliance } = summarizeAlerts(scoped, to);

  const gainReviews = model.positions
    .filter((r) => r.rules["price-target"].status === "yellow" || r.position.approval?.gain_unrelated_to_thesis)
    .map((r) => ({
      symbol: r.position.symbol,
      reason: r.position.approval?.gain_unrelated_to_thesis
        ? "Gain unrelated to thesis (flagged by the Risk Manager)"
        : "Reached price target",
      price: r.position.price,
      target: r.position.approval?.price_target ?? null,
    }));

  const calendarRow = model.monitors
    .flatMap((g) => g.rows)
    .find((r) => r.monitor.id === "trading-calendar");

  const activity: ActivityMetrics = {
    changes,
    stopLossEvents,
    gainReviews,
    alertSummary: summary,
    limitCompliance: compliance,
    blackoutTrades: calendarRow?.value ?? null,
    blackoutWindow: config.blackout,
  };

  return {
    period,
    periodLabel: PERIOD_LABEL[period],
    from,
    to,
    generatedAt: new Date().toISOString(),
    performance,
    risk,
    activity,
    snapshotCount: snapshots.length,
  };
}

// ── §5.4 Report packs ─────────────────────────────────────────────────────

export type PackId = "weekly" | "monthly" | "semester" | "advisory" | "annual";

export type PackDef = {
  id: PackId;
  title: string;
  recipient: string;
  cadence: string;
  /** Default period the pack opens on. */
  period: PeriodKey;
  contents: string[];
  source: string;
};

export const REPORT_PACKS: PackDef[] = [
  {
    id: "weekly",
    title: "Weekly risk report",
    recipient: "Equities PM",
    cadence: "Weekly",
    period: "wtd",
    contents: ["Limit strip snapshot", "Position table", "Open alerts", "Week-to-date return and volatility"],
    source: "Gov. IV.a",
  },
  {
    id: "monthly",
    title: "Monthly report",
    recipient: "President",
    cadence: "Monthly",
    period: "mtd",
    contents: [
      "NAV and P&L",
      "Period return vs 3-month T-bill",
      "Portfolio changes",
      "All §5.2 risk metrics",
      "Alert summary",
      "Limit compliance table",
    ],
    source: "Gov. IV.a: asset values, profits/losses, portfolio changes, key decisions",
  },
  {
    id: "semester",
    title: "Semester performance analysis",
    recipient: "Investment Committee, Faculty Advisor",
    cadence: "Each semester",
    period: "std",
    contents: ["The monthly pack extended to semester-to-date", "Return vs benchmark"],
    source: "Gov. IV.a",
  },
  {
    id: "advisory",
    title: "Advisory Board report",
    recipient: "Advisory Board",
    cadence: "Semi-annually",
    period: "std",
    contents: [
      "Portfolio composition",
      "New acquisitions and divestitures",
      "Sector allocations",
      "Returns",
      "Risk exposure",
      "Limit compliance",
    ],
    source: "Gov. IV.a",
  },
  {
    id: "annual",
    title: "Academic year report",
    recipient: "All stakeholders",
    cadence: "Annually",
    period: "fytd",
    contents: ["The full-year version of the above", "Auditable: every figure traceable to stored daily data"],
    source: "Gov. IV.a",
  },
];

const pct = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(digits)}%`;
const usd = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `$${Math.round(v).toLocaleString("en-US")}`;

/**
 * A report pack as markdown, ready to print to PDF or email. Every figure
 * carries its as-of date and the snapshot count behind it, so a reader can
 * trace it back to stored data [§5.4 annual pack: "must be auditable"].
 */
export function renderPack(pack: PackDef, report: ReportingModel, model: RiskModel): string {
  const lines: string[] = [];
  lines.push(`# Garnet Fund — ${pack.title}`);
  lines.push("");
  lines.push(`**Recipient:** ${pack.recipient} · **Cadence:** ${pack.cadence}`);
  lines.push(`**Period:** ${report.periodLabel} (${report.from ?? "inception"} → ${report.to})`);
  lines.push(`**Generated:** ${new Date(report.generatedAt).toUTCString()}`);
  lines.push(`**Built from:** ${report.snapshotCount} stored daily snapshot${report.snapshotCount === 1 ? "" : "s"}`);
  lines.push("");

  lines.push("## Performance");
  lines.push(`- NAV / AUM: ${usd(report.performance.nav)}`);
  lines.push(`- Period return (time-weighted, net of costs): ${pct(report.performance.periodReturnPct)}`);
  lines.push(`- 3-month T-bill over the same period: ${pct(report.performance.benchmarkReturnPct)}`);
  lines.push(`- Return vs benchmark: ${pct(report.performance.excessReturnPct)}`);
  lines.push(`- Unrealized P&L: ${usd(report.performance.unrealizedPnl)}`);
  for (const t of report.performance.pnlByTeam) {
    lines.push(`  - ${t.team === "equities" ? "Equities" : "Alternatives"}: ${usd(t.unrealized)}`);
  }
  lines.push("");

  if (pack.id === "weekly") {
    lines.push("## Limit strip");
    for (const group of model.monitors) {
      for (const row of group.rows) {
        const dot = row.status === "red" ? "RED" : row.status === "yellow" ? "YELLOW" : row.status === "green" ? "green" : "—";
        lines.push(`- [${dot}] ${row.monitor.label}: ${row.display} against ${row.limitText}`);
      }
    }
    lines.push("");
    lines.push("## Positions");
    lines.push("| Ticker | Side | Team | % NAV | P&L vs cost | Stop | VaR share |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of model.positions) {
      lines.push(
        `| ${row.position.symbol} | ${row.position.side} | ${row.position.team} | ${row.position.weightPct.toFixed(2)}% | ${row.rules["pnl-vs-cost"].display} | ${row.rules["stop-order-present"].display} | ${row.rules["position-var-share"].display} |`,
      );
    }
    lines.push("");
  }

  if (pack.id !== "weekly") {
    lines.push("## Risk");
    lines.push(
      `- Annualized volatility: ${pct(report.risk.annualizedVolPct)} against a ${report.risk.volCap ?? "—"}% cap`,
    );
    lines.push(
      `- Sharpe ratio: ${report.risk.sharpe != null ? report.risk.sharpe.toFixed(2) : `— (${report.risk.sharpeUnavailableReason})`}`,
    );
    lines.push(
      `- One-day 95% VaR: ${usd(report.risk.var95Dollars)} (${pct(report.risk.var95Pct)} of NAV), ${report.risk.varObservations} observations`,
    );
    lines.push(`- Gross exposure: ${pct(model.exposure?.grossPct)} · Net exposure: ${pct(model.exposure?.netPct)}`);
    lines.push(
      `- Allocation: Equities ${pct(model.exposure?.equitiesPct)} / Alternatives ${pct(model.exposure?.alternativesPct)} against the 75/25 targets`,
    );
    lines.push("");
    lines.push("### Sector allocation (Equities book, % of NAV)");
    lines.push("| Sector | Long | Short | Gross | Net |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const s of report.risk.sectors) {
      lines.push(`| ${s.sector} | ${pct(s.longPct, 1)} | ${pct(s.shortPct, 1)} | ${pct(s.grossPct, 1)} | ${pct(s.netPct, 1)} |`);
    }
    lines.push(`\n_Gross cap: ${report.risk.sectorCap ?? "—"}% of NAV._`);
    lines.push("");
    lines.push("### Asset class allocation");
    for (const a of report.risk.assetClasses) lines.push(`- ${a.assetClass}: ${pct(a.pct, 1)}`);
    lines.push("");
  }

  lines.push("## Activity and compliance");
  lines.push(`### Portfolio changes (${report.activity.changes.length})`);
  if (!report.activity.changes.length) lines.push("- None over the period.");
  for (const c of report.activity.changes) {
    const detail =
      c.change === "opened"
        ? `opened at ${pct(c.to, 1)} of NAV`
        : c.change === "closed"
          ? `closed from ${pct(c.from, 1)} of NAV`
          : `resized ${pct(c.from, 1)} → ${pct(c.to, 1)} of NAV`;
    const approval = c.approvalDate ? ` — approved ${c.approvalDate}${c.approvedBy ? ` by ${c.approvedBy}` : ""}` : "";
    lines.push(`- ${c.symbol}: ${detail}${approval}`);
  }
  lines.push("");

  lines.push(`### Stop-loss events (${report.activity.stopLossEvents.length})`);
  if (!report.activity.stopLossEvents.length) lines.push("- None over the period.");
  for (const e of report.activity.stopLossEvents) {
    lines.push(
      `- ${e.symbol} (${e.side ?? "—"}): realized loss ${usd(e.realized_loss)}, ${pct(e.pnl_pct, 1)} vs cost — post-mortem ${e.post_mortem_delivered ? "delivered" : "OUTSTANDING"}`,
    );
  }
  lines.push("");

  lines.push(`### Gain reviews (${report.activity.gainReviews.length})`);
  if (!report.activity.gainReviews.length) lines.push("- None outstanding.");
  for (const g of report.activity.gainReviews) {
    lines.push(`- ${g.symbol}: ${g.reason} (last ${usd(g.price)}${g.target != null ? `, target ${usd(g.target)}` : ""})`);
  }
  lines.push("");

  lines.push("### Limit compliance");
  lines.push("| Limit | Breached this period | Days outside | Maximum excursion |");
  lines.push("| --- | --- | --- | --- |");
  if (!report.activity.limitCompliance.length) {
    lines.push("| All limits | No | 0 | — |");
  }
  for (const row of report.activity.limitCompliance) {
    lines.push(
      `| ${row.label} | ${row.breached ? "Yes" : "No"} | ${row.daysOutside} | ${row.maxExcursion != null ? row.maxExcursion.toFixed(2) : "—"} |`,
    );
  }
  lines.push("");

  lines.push("### Trading calendar");
  if (report.activity.blackoutWindow) {
    lines.push(
      report.activity.blackoutTrades === 0
        ? `- Confirmed: no trades occurred in the summer blackout (${report.activity.blackoutWindow.start} → ${report.activity.blackoutWindow.end}).`
        : `- ${report.activity.blackoutTrades} trade(s) detected inside the blackout (${report.activity.blackoutWindow.start} → ${report.activity.blackoutWindow.end}).`,
    );
  } else {
    lines.push("- No blackout window is configured for this academic year, so no confirmation can be given.");
  }

  return lines.join("\n");
}
