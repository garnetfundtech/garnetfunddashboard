/**
 * The Fund's own daily NAV series, and everything computed from it.
 *
 * §8: "Volatility, Sharpe, VaR and beta are all computed from the Fund's own
 * daily NAV series, which cannot be reconstructed after the fact." That is why
 * this is a stored table rather than something derived from live positions —
 * and why every function here reports how many observations it had. A 60-day
 * volatility computed from 11 days is not a smaller number, it is a wrong one,
 * so the caller is told and the card says so.
 *
 * §6 Returns: daily return = (NAV today − NAV yesterday − net external flows)
 * ÷ NAV yesterday. Donations are external flows, not performance. Chain-link
 * for periods; annualize by ×252 for returns and ×√252 for volatility.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { historicalVaR, stdSample } from "@/lib/portfolio-analytics";

export type NavPoint = {
  captured_on: string;
  nav: number;
  external_flow: number;
  source: "broker" | "manual";
};

export type NavSeries = {
  points: NavPoint[];
  /** Daily returns, oldest first, aligned to points[1..]. */
  returns: number[];
  observations: number;
};

const TRADING_DAYS = 252;

/** The stored NAV series, oldest first. */
export async function getNavSeries(limitDays = 400): Promise<NavSeries> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("nav_daily")
      .select("captured_on, nav, external_flow, source")
      .order("captured_on", { ascending: false })
      .limit(limitDays);
    if (error || !data) return { points: [], returns: [], observations: 0 };

    const points = (data as NavPoint[]).slice().reverse().filter((p) => Number(p.nav) > 0);
    return { points, returns: dailyReturns(points), observations: Math.max(points.length - 1, 0) };
  } catch {
    return { points: [], returns: [], observations: 0 };
  }
}

/** §6: external flows are removed before the return is taken. */
export function dailyReturns(points: NavPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = Number(points[i - 1].nav);
    const curr = Number(points[i].nav);
    const flow = Number(points[i].external_flow ?? 0);
    if (!(prev > 0)) continue;
    out.push((curr - prev - flow) / prev);
  }
  return out;
}

/** Chain-linked time-weighted return over a set of daily returns, as a %. */
export function chainLink(returns: number[]): number | null {
  if (!returns.length) return null;
  let growth = 1;
  for (const r of returns) growth *= 1 + r;
  return (growth - 1) * 100;
}

export type VolatilityResult = {
  /** Annualized volatility as a percentage, or null when unmeasurable. */
  value: number | null;
  observations: number;
  /** True when fewer observations exist than the configured window. */
  short: boolean;
};

/**
 * Annualized volatility: std. dev. of daily fund returns × √252 over the
 * trailing window. Uses what history exists and reports the shortfall rather
 * than padding the window out.
 */
export function annualizedVolatility(returns: number[], windowDays: number): VolatilityResult {
  const window = returns.slice(-windowDays);
  // Two points cannot describe a distribution; below this the number is noise
  // dressed as a limit check.
  if (window.length < 20) {
    return { value: null, observations: window.length, short: true };
  }
  const sd = stdSample(window);
  if (!sd) return { value: null, observations: window.length, short: true };
  return {
    value: sd * Math.sqrt(TRADING_DAYS) * 100,
    observations: window.length,
    short: window.length < windowDays,
  };
}

/**
 * Sharpe against the 3-month T-bill, not the market: §5.2, shown only once at
 * least the configured number of daily observations exist.
 */
export function sharpeRatio(
  returns: number[],
  annualRiskFreePct: number | null,
  minObservations: number,
): number | null {
  if (returns.length < minObservations) return null;
  const sd = stdSample(returns);
  if (!sd) return null;
  const meanDaily = returns.reduce((s, r) => s + r, 0) / returns.length;
  const annualReturn = meanDaily * TRADING_DAYS;
  const rf = (annualRiskFreePct ?? 0) / 100;
  const annualVol = sd * Math.sqrt(TRADING_DAYS);
  if (annualVol === 0) return null;
  return (annualReturn - rf) / annualVol;
}

export type FundVar = {
  dollars: number | null;
  pct: number | null;
  observations: number;
};

/**
 * Portfolio one-day 95% VaR by historical simulation on the Fund's own return
 * series [§5.2, §6]. Where price history is shorter than the lookback, uses
 * what exists and flags the observation count.
 */
export function fundVaR(returns: number[], nav: number | null, lookbackDays: number): FundVar {
  const window = returns.slice(-lookbackDays);
  if (window.length < 30 || nav == null || nav <= 0) {
    return { dollars: null, pct: null, observations: window.length };
  }
  const q = historicalVaR(window, 0.95);
  if (q == null) return { dollars: null, pct: null, observations: window.length };
  const pct = Math.abs(q) * 100;
  return { dollars: (pct / 100) * nav, pct, observations: window.length };
}

/**
 * Records today's NAV. Called from the snapshot cron, so a re-run on the same
 * day corrects the row rather than duplicating it. `external_flow` is only
 * ever set by a human — the broker cannot tell a donation from a gain.
 */
export async function recordNav(params: {
  capturedOn: string;
  nav: number;
  source?: "broker" | "manual";
  externalFlow?: number;
  note?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    captured_on: params.capturedOn,
    nav: params.nav,
    source: params.source ?? "broker",
  };
  if (params.externalFlow != null) patch.external_flow = params.externalFlow;
  if (params.note != null) patch.note = params.note;
  const { error } = await admin.from("nav_daily").upsert(patch, { onConflict: "captured_on" });
  if (error) throw error;
}

export type NavImportResult = { imported: number; skipped: string[] };

/**
 * §8: "Storage of a daily NAV record begins at go-live, and the Risk Manager
 * is maintaining a manual NAV log until then for import on day one."
 *
 * Accepts one record per line as `date,nav` or `date,nav,external_flow`, with
 * an optional header row. Rows are validated individually and a bad row is
 * reported rather than silently dropped — an import that quietly loses a day
 * puts a hole in the series every later return calculation reads through.
 *
 * Imported rows are marked source 'manual' so a later audit can tell which
 * figures came from the broker and which from the Risk Manager's own log.
 */
export function parseNavLog(text: string): { rows: NavPoint[]; skipped: string[] } {
  const rows: NavPoint[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Tolerate a header row without making the caller strip it.
    if (/^(date|captured_on)\b/i.test(line)) continue;

    const parts = line.split(/[,\t;]/).map((c) => c.trim());
    const [dateRaw, navRaw, flowRaw] = parts;

    const date = normalizeDate(dateRaw ?? "");
    const nav = Number(navRaw?.replace(/[$,]/g, ""));
    const flow = flowRaw ? Number(flowRaw.replace(/[$,]/g, "")) : 0;

    if (!date) { skipped.push(`${line} — unrecognised date`); continue; }
    if (!Number.isFinite(nav) || nav <= 0) { skipped.push(`${line} — NAV must be a positive number`); continue; }
    if (!Number.isFinite(flow)) { skipped.push(`${line} — external flow must be a number`); continue; }
    if (seen.has(date)) { skipped.push(`${line} — duplicate date in this import`); continue; }

    seen.add(date);
    rows.push({ captured_on: date, nav, external_flow: flow, source: "manual" });
  }

  rows.sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  return { rows, skipped };
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY and M/D/YY. Returns ISO, or "" if unusable. */
function normalizeDate(input: string): string {
  const value = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? "" : value;
  }
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value);
  if (slash) {
    const [, m, d, y] = slash;
    const year = y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? "" : iso;
  }
  return "";
}

/**
 * Writes an imported log. Existing rows for the same date are replaced, so a
 * corrected log can be re-imported without first deleting anything.
 */
export async function importNavLog(text: string): Promise<NavImportResult> {
  const { rows, skipped } = parseNavLog(text);
  if (!rows.length) return { imported: 0, skipped };

  const admin = createAdminClient();
  const { error } = await admin.from("nav_daily").upsert(
    rows.map((r) => ({
      captured_on: r.captured_on,
      nav: r.nav,
      external_flow: r.external_flow,
      source: "manual",
      note: "Imported from the Risk Manager's pre-go-live NAV log [§8].",
    })),
    { onConflict: "captured_on" },
  );
  if (error) throw error;
  return { imported: rows.length, skipped };
}

/**
 * A day-over-day NAV move this large cannot be performance.
 *
 * At the IPS's 12% *annualized* volatility ceiling, a 25% single-day move is
 * on the order of three hundred standard deviations. Anything at that scale is
 * money arriving or leaving — a donation, a disbursement, or the fund being
 * seeded — and recording it as a return would poison every period return,
 * the volatility figure and Sharpe along with it.
 */
const IMPLAUSIBLE_DAILY_MOVE = 0.25;

export type NavBackfill = {
  added: number;
  skipped: number;
  /** Days recorded as flows because the move could not have been performance. */
  flagged: { date: string; movePct: number; flow: number }[];
};

/**
 * Backfills nav_daily from the NAV already stored on each daily risk snapshot.
 *
 * The snapshot table has been recording NAV since well before nav_daily
 * existed, and it is the same quantity under §6 — total account equity at the
 * close. Copying it across is not a reconstruction; it is reading a figure
 * captured on the day, which is what §8 asks for.
 *
 * The subtlety is external flows. A snapshot cannot tell a donation from a
 * gain, and this fund's own history contains a day where NAV went from $502 to
 * roughly $100,000 — the seeding. Imported naively that is a 19,925% return,
 * which would make volatility meaningless and every period return wrong.
 *
 * So any day whose implied move exceeds what performance could produce is
 * written with its whole change recorded as an external flow, which nets the
 * day's return to zero, and is reported back so the Risk Manager can replace
 * the estimate with the actual contribution. That is a stated assumption on a
 * day that is otherwise unusable, not a silent approximation of a real return.
 *
 * Days already in nav_daily are never touched: a figure the Risk Manager
 * entered outranks one derived here.
 */
export async function backfillNavFromSnapshots(): Promise<NavBackfill> {
  const admin = createAdminClient();

  const { data: snaps } = await admin
    .from("risk_snapshots")
    .select("captured_on, nav")
    .not("nav", "is", null)
    .order("captured_on", { ascending: true });
  if (!snaps?.length) return { added: 0, skipped: 0, flagged: [] };

  const { data: existing } = await admin.from("nav_daily").select("captured_on");
  const have = new Set((existing ?? []).map((r) => r.captured_on as string));

  const series = (snaps as { captured_on: string; nav: number }[]).filter((r) => Number(r.nav) > 0);

  const rows: Record<string, unknown>[] = [];
  const flagged: NavBackfill["flagged"] = [];

  for (let i = 0; i < series.length; i++) {
    const row = series[i];
    if (have.has(row.captured_on)) continue;

    const nav = Number(row.nav);
    // Compare against the previous stored day, whether or not it was imported,
    // so the check does not miss a jump that straddles an existing row.
    const prior = i > 0 ? Number(series[i - 1].nav) : null;
    const move = prior != null && prior > 0 ? (nav - prior) / prior : 0;

    if (Math.abs(move) > IMPLAUSIBLE_DAILY_MOVE && prior != null) {
      const flow = nav - prior;
      flagged.push({ date: row.captured_on, movePct: move * 100, flow });
      rows.push({
        captured_on: row.captured_on,
        nav,
        external_flow: flow,
        source: "broker",
        note:
          `Move of ${(move * 100).toFixed(0)}% cannot be performance, so the full change of ` +
          `${flow.toFixed(2)} is recorded as an external flow. Replace with the actual ` +
          `contribution or disbursement for this date.`,
      });
      continue;
    }

    rows.push({
      captured_on: row.captured_on,
      nav,
      external_flow: 0,
      source: "broker",
      note: "Backfilled from the stored daily risk snapshot for this date.",
    });
  }

  if (!rows.length) return { added: 0, skipped: series.length, flagged };

  const { error } = await admin.from("nav_daily").insert(rows);
  if (error) throw error;
  return { added: rows.length, skipped: series.length - rows.length, flagged };
}

// ── Period selection (§5, date-range selector) ────────────────────────────

export type PeriodKey = "wtd" | "mtd" | "std" | "fytd" | "inception";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  wtd: "Week to date",
  mtd: "Month to date",
  std: "Semester to date",
  fytd: "Fiscal year to date",
  inception: "Since inception",
};

/**
 * The start date for a period. The fiscal year is taken as July 1 and the
 * semesters as the university's own (Spring from January, Fall from August),
 * which is what the Governance Document's reporting cadence follows.
 */
export function periodStart(period: PeriodKey, today = new Date()): string | null {
  const d = new Date(today);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();

  switch (period) {
    case "wtd": {
      const start = new Date(d);
      start.setUTCDate(d.getUTCDate() - d.getUTCDay());
      return start.toISOString().slice(0, 10);
    }
    case "mtd":
      return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    case "std":
      // Spring runs January–July; Fall August–December.
      return m < 7
        ? new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
        : new Date(Date.UTC(y, 7, 1)).toISOString().slice(0, 10);
    case "fytd":
      return m >= 6
        ? new Date(Date.UTC(y, 6, 1)).toISOString().slice(0, 10)
        : new Date(Date.UTC(y - 1, 6, 1)).toISOString().slice(0, 10);
    case "inception":
      return null;
    default:
      return null;
  }
}

/** Slices the series to a period, keeping the point before it as the base. */
/** Jan 1 of the current calendar year — "YTD" as a reader expects it. */
export function calendarYearStart(today = new Date()): string {
  return new Date(Date.UTC(today.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
}

export function sliceSeries(series: NavSeries, from: string | null): NavSeries {
  if (!from) return series;
  const idx = series.points.findIndex((p) => p.captured_on >= from);
  if (idx < 0) return { points: [], returns: [], observations: 0 };
  // Keep one prior point so the first in-period return has a denominator.
  const start = Math.max(idx - 1, 0);
  const points = series.points.slice(start);
  return { points, returns: dailyReturns(points), observations: Math.max(points.length - 1, 0) };
}

/**
 * The T-bill return over the same number of trading days, for the §5.1
 * "return vs benchmark" line. Converts the quoted annual yield to a daily
 * rate and compounds it across the period.
 */
export function benchmarkReturn(annualYieldPct: number | null, tradingDays: number): number | null {
  if (annualYieldPct == null || tradingDays <= 0) return null;
  const daily = Math.pow(1 + annualYieldPct / 100, 1 / TRADING_DAYS) - 1;
  return (Math.pow(1 + daily, tradingDays) - 1) * 100;
}
