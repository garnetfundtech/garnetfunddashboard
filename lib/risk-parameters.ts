/**
 * Garnet Fund — Risk Parameters (single source of truth)
 *
 * Every limit, band, and threshold from the fund's risk framework is encoded
 * here so the rest of the system (engine + Risk Monitor UI) reads from one
 * place. Numeric green/yellow cutoffs are our interpretation of the written
 * targets — they're annotated on each row and are trivial to tune.
 *
 * Framework authored by the PM team (Nihar / Chase / Arav). Where a metric
 * needs data we don't yet compute live (factor regressions, VaR, stress
 * tests), the row is still defined so nothing is lost — it carries a
 * `dataSource` of "manual" or "planned" and the UI labels it honestly.
 */

export type RiskStatus = "green" | "yellow" | "red" | "na";

export type RiskGroup =
  | "exposure"
  | "factor"
  | "sizing"
  | "drawdown"
  | "performance"
  | "health";

export type RiskCadence = "daily" | "weekly" | "monthly" | "quarterly" | "event";

/** Whether the value behind this row comes from live data, sample/demo data,
 *  manual entry, or is planned for a later phase. */
export type RiskDataSource = "live" | "sample" | "manual" | "planned";

export type RiskUnit = "%" | "beta" | "x" | "ratio" | "count" | "$" | "";

/**
 * How the current value is scored against the limit:
 *  - abs-band  value magnitude should stay small     (|v| ≤ green → yellow → red)
 *  - max       value should stay below a ceiling     (v ≤ green → yellow → red)
 *  - min       value should stay above a floor       (v ≥ green → yellow → red)
 *  - range     value should stay inside a band       (rangeGreen[0..1] → yellow either side → red past rangeYellow)
 *              e.g. gross exposure: green 135–165, yellow 165–175 or below 135, red beyond either.
 */
export type RiskKind = "abs-band" | "max" | "min" | "range";

export type RiskLimit = {
  id: string;
  group: RiskGroup;
  label: string;
  /** Human-readable target straight from the notes, e.g. "0% · band ±10%". */
  target: string;
  unit: RiskUnit;
  kind: RiskKind;
  /** Boundary of the green (in-policy) zone. Unused (0) for kind "range" — use rangeGreen instead. */
  green: number;
  /** Boundary of the yellow (watch) zone; beyond it is red (breach). Unused (0) for kind "range". */
  yellow: number;
  /** kind "range" only: [low, high] of the green band, e.g. [135, 165]. */
  rangeGreen?: [number, number];
  /** kind "range" only: [low, high] of the yellow band; outside this is red. */
  rangeYellow?: [number, number];
  cadence: RiskCadence;
  /** Red always notifies. These four also notify on yellow because they drift
   *  on their own and are slow to reverse — see the framework doc's
   *  Notification Rules section. Every other item stays board-color-only
   *  until red. */
  notifyOnYellow?: boolean;
  /** Whether a breach fires during market hours (item 5) or batches into the
   *  end-of-day send (everything else). */
  alertTiming?: "intraday" | "close";
  dataSource: RiskDataSource;
  /** "What kills the idea" — the rationale / backstop behind the number. */
  note?: string;
};

export const RISK_GROUPS: { id: RiskGroup; label: string; blurb: string }[] = [
  { id: "exposure", label: "Exposure & Neutrality", blurb: "Net / gross / beta — the daily glance. Drifts every day even when we don't trade." },
  { id: "factor", label: "Factor & Sector", blurb: "Style loadings and sector long-vs-short balance." },
  { id: "sizing", label: "Position Sizing", blurb: "Asymmetric by design — the short book runs tighter across the board." },
  { id: "drawdown", label: "Drawdown & VaR", blurb: "Backstops that force a committee conversation before new risk." },
  { id: "performance", label: "Performance", blurb: "The scorecard — reviewed monthly against T-bills, not the market." },
  { id: "health", label: "Health Checks", blurb: "Plumbing that keeps the book tradable and diversified." },
];

export const CADENCE_LABEL: Record<RiskCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  event: "Pre-catalyst",
};

/**
 * The full limit set. Order within a group is display order.
 */
export const RISK_LIMITS: RiskLimit[] = [
  // ── Exposure & Neutrality ──────────────────────────────────────────────
  {
    id: "net-exposure",
    group: "exposure",
    label: "Net Exposure",
    target: "0% · rebalance band ±10%",
    unit: "%",
    kind: "abs-band",
    green: 7,
    yellow: 10,
    cadence: "daily",
    dataSource: "live",
    notifyOnYellow: true,
    alertTiming: "close",
    note: "Longs minus shorts. Won't sit at 0 — daily market moves push it around even when we don't touch anything. Outside ±10% → rebalance within 2 trading days. Red starts a 2-trading-day countdown; if it expires still red, the notification escalates.",
  },
  {
    id: "gross-exposure",
    group: "exposure",
    label: "Gross Exposure",
    target: "135–165% (75/75) · hard cap 175%",
    unit: "%",
    kind: "range",
    green: 0,
    yellow: 0,
    rangeGreen: [135, 165],
    rangeYellow: [165, 175],
    cadence: "daily",
    dataSource: "live",
    alertTiming: "close",
    note: "Longs plus shorts. Target 135–165% split ~75% long / 75% short. Low gross (under 135%) is yellow, not red — it means we've quietly stopped deploying capital. Hard cap 175%.",
  },
  {
    id: "net-beta",
    group: "exposure",
    label: "Net Beta (vs S&P 500)",
    target: "−0.10 to +0.10",
    unit: "beta",
    kind: "abs-band",
    green: 0.07,
    yellow: 0.1,
    cadence: "weekly",
    dataSource: "live",
    notifyOnYellow: true,
    alertTiming: "close",
    note: "Weekly run regression. Outside ±0.10 → bring the book back inside within 2 trading days.",
  },

  // ── Factor & Sector ────────────────────────────────────────────────────
  {
    id: "factor-size",
    group: "factor",
    label: "Size Loading",
    target: "±0.20",
    unit: "beta",
    kind: "abs-band",
    green: 0.15,
    yellow: 0.2,
    cadence: "monthly",
    dataSource: "planned",
    note: "Monthly factor regression. Each style loading stays within ±0.20.",
  },
  {
    id: "factor-value",
    group: "factor",
    label: "Value Loading",
    target: "±0.20",
    unit: "beta",
    kind: "abs-band",
    green: 0.15,
    yellow: 0.2,
    cadence: "monthly",
    dataSource: "planned",
    note: "Monthly factor regression. Each style loading stays within ±0.20.",
  },
  {
    id: "factor-momentum",
    group: "factor",
    label: "Momentum Loading",
    target: "±0.20",
    unit: "beta",
    kind: "abs-band",
    green: 0.15,
    yellow: 0.2,
    cadence: "monthly",
    dataSource: "planned",
    note: "Monthly factor regression. Each style loading stays within ±0.20.",
  },
  {
    id: "sector-balance",
    group: "factor",
    label: "Sector Long-vs-Short Gap",
    target: "each sector within ±5%",
    unit: "%",
    kind: "abs-band",
    green: 4,
    yellow: 5,
    cadence: "weekly",
    dataSource: "live",
    alertTiming: "close",
    note: "Each sector's long weight stays within ±5% of its short weight, in percentage points of NAV. Value shown is the widest sector gap. Show the industry breakdown underneath — a sector can look balanced while one industry inside it is a concentrated bet.",
  },

  // ── Position Sizing ────────────────────────────────────────────────────
  {
    id: "max-long-weight",
    group: "sizing",
    label: "Largest Long",
    target: "≤ 5% of fund",
    unit: "%",
    kind: "max",
    green: 4.5,
    yellow: 5,
    cadence: "daily",
    dataSource: "live",
    note: "Longs max out at 5% of the fund.",
  },
  {
    id: "max-short-weight",
    group: "sizing",
    label: "Largest Short",
    target: "≤ 3% · new shorts start 2%",
    unit: "%",
    kind: "max",
    green: 2.5,
    yellow: 3,
    cadence: "daily",
    dataSource: "live",
    notifyOnYellow: true,
    alertTiming: "close",
    note: "Measured at market value, not cost. Shorts cap at 3%; new shorts start at 2% and flag red above that. A short grows as it moves against you while the loss is uncapped — a 3% short that doubles becomes a ~6% position having never been added to — so the short book runs tighter than the long book.",
  },
  {
    id: "single-day-move",
    group: "sizing",
    label: "Single-Day Move",
    target: "adverse move ≤ 6% · red past 10%",
    unit: "%",
    kind: "max",
    green: 6,
    yellow: 10,
    cadence: "daily",
    dataSource: "live",
    alertTiming: "intraday",
    note: "Close-to-close change. Adverse means down for a long, up for a short — a favorable move of any size is green, no notification. A 6% move is roughly three standard deviations for a typical large-cap (≈1.9% daily vol); 10% is roughly five. Red fires during the trading day, not the end-of-day batch. Value shown is the worst adverse move in the book.",
  },
  {
    id: "long-kill-trigger",
    group: "sizing",
    label: "Long Kill-Trigger",
    target: "−20% from cost",
    unit: "%",
    kind: "min",
    green: -15,
    yellow: -20,
    cadence: "daily",
    dataSource: "live",
    note: "Backstop: −20% from cost on a long forces a review of what killed the idea. Value shown is the worst long drawdown from cost.",
  },
  {
    id: "short-kill-trigger",
    group: "sizing",
    label: "Short Kill-Trigger",
    target: "−15% against us",
    unit: "%",
    kind: "min",
    green: -10,
    yellow: -15,
    cadence: "daily",
    dataSource: "live",
    note: "Backstop: −15% against us on a short forces a review. Value shown is the worst short move against us.",
  },
  {
    id: "borrow-fee-gate",
    group: "sizing",
    label: "Short Borrow Fee",
    target: "≤ ~3% / yr to short",
    unit: "%",
    kind: "max",
    green: 3,
    yellow: 3,
    cadence: "event",
    dataSource: "manual",
    note: "We don't short anything with a borrow fee above ~3%/yr. Check before pitching a short, not after. Value shown is the highest borrow fee in the short book.",
  },
  {
    id: "short-interest-gate",
    group: "sizing",
    label: "Short Interest",
    target: "≤ ~15% of float",
    unit: "%",
    kind: "max",
    green: 15,
    yellow: 15,
    cadence: "event",
    dataSource: "manual",
    note: "We don't short anything with short interest above ~15% of float. Value shown is the highest SI in the short book.",
  },
  {
    id: "liquidity-exit",
    group: "sizing",
    label: "Liquidity (days to exit)",
    target: "≤ 2–3 trading days",
    unit: "count",
    kind: "max",
    green: 2,
    yellow: 3,
    cadence: "weekly",
    dataSource: "manual",
    note: "Nothing on either side we can't exit within 2–3 trading days. Value shown is the slowest position to unwind.",
  },

  // ── Drawdown & VaR ─────────────────────────────────────────────────────
  {
    id: "drawdown-from-high",
    group: "drawdown",
    label: "Drawdown from High",
    target: "−8% → committee before new risk",
    unit: "%",
    kind: "min",
    green: -5,
    yellow: -8,
    cadence: "daily",
    dataSource: "live",
    notifyOnYellow: true,
    alertTiming: "close",
    note: "Fall 8% from the high-water mark (which only ratchets upward) → no new risk until the committee meets. Tight on purpose — at 4–8% target annualised volatility, an 8% drawdown is a larger move than one standard deviation over a full year in a market-neutral book. Persistent, undismissable banner on red.",
  },
  {
    id: "var-95",
    group: "drawdown",
    label: "95% VaR (daily)",
    target: "watch vs long-only book",
    unit: "%",
    kind: "max",
    green: 1.5,
    yellow: 2.5,
    cadence: "daily",
    dataSource: "planned",
    note: "Track 95% VaR daily with CVaR alongside. If VaR ever approaches what a long-only book would show, that itself is the alarm that neutrality has drifted.",
  },
  {
    id: "cvar-95",
    group: "drawdown",
    label: "95% CVaR (daily)",
    target: "tracked alongside VaR",
    unit: "%",
    kind: "max",
    green: 2.5,
    yellow: 3.5,
    cadence: "daily",
    dataSource: "planned",
    note: "Expected loss in the worst 5% of days. Sits next to VaR.",
  },

  // ── Performance ────────────────────────────────────────────────────────
  {
    id: "sharpe",
    group: "performance",
    label: "Sharpe Ratio",
    target: "> 1.0 · floor 0.5",
    unit: "ratio",
    kind: "min",
    green: 1.0,
    yellow: 0.5,
    cadence: "monthly",
    dataSource: "live",
    note: "The scorecard. Judged vs T-bills, not the market — up 6% while the market is down 20% is the same job as up 6% while it's up 20%.",
  },
  {
    id: "sortino",
    group: "performance",
    label: "Sortino Ratio",
    target: "> 1.5 · flag if < Sharpe",
    unit: "ratio",
    kind: "min",
    green: 1.5,
    yellow: 1.0,
    cadence: "monthly",
    dataSource: "planned",
    note: "Downside-only risk-adjusted return. Flag if it ever drops below Sharpe.",
  },
  {
    id: "realized-vol",
    group: "performance",
    label: "Realized Volatility",
    target: "4–8% annualized · flag > 10%",
    unit: "%",
    kind: "max",
    green: 8,
    yellow: 10,
    cadence: "monthly",
    dataSource: "live",
    note: "Annualized. Target band 4–8%, hard flag at 10%.",
  },
  {
    id: "r2-spx",
    group: "performance",
    label: "R² vs S&P 500",
    target: "< 0.10 · flag at 0.20",
    unit: "ratio",
    kind: "max",
    green: 0.1,
    yellow: 0.2,
    cadence: "monthly",
    dataSource: "planned",
    note: "How much of our return the market explains. Low is the point of a neutral book.",
  },
  {
    id: "long-alpha",
    group: "performance",
    label: "Long Alpha (2Q)",
    target: "positive over trailing 2Q",
    unit: "%",
    kind: "min",
    green: 0,
    yellow: 0,
    cadence: "quarterly",
    dataSource: "planned",
    note: "Each side positive over the trailing two quarters. One side negative two quarters straight → review that book.",
  },
  {
    id: "short-alpha",
    group: "performance",
    label: "Short Alpha (2Q)",
    target: "positive over trailing 2Q",
    unit: "%",
    kind: "min",
    green: 0,
    yellow: 0,
    cadence: "quarterly",
    dataSource: "planned",
    note: "Each side positive over the trailing two quarters. Most books earn on one side — knowing which is how we get better.",
  },
  {
    id: "hit-rate",
    group: "performance",
    label: "Hit Rate",
    target: "> 50%",
    unit: "%",
    kind: "min",
    green: 52,
    yellow: 50,
    cadence: "monthly",
    dataSource: "planned",
    note: "Share of positions that made money.",
  },
  {
    id: "slugging",
    group: "performance",
    label: "Slugging (avg win ÷ avg loss)",
    target: "> 1.2",
    unit: "x",
    kind: "min",
    green: 1.2,
    yellow: 1.0,
    cadence: "monthly",
    dataSource: "planned",
    note: "Average winner divided by average loser.",
  },

  // ── Health Checks ──────────────────────────────────────────────────────
  {
    id: "calmar",
    group: "health",
    label: "Calmar Ratio",
    target: "> 1.0",
    unit: "ratio",
    kind: "min",
    green: 1.0,
    yellow: 0.7,
    cadence: "monthly",
    dataSource: "planned",
    note: "Return over max drawdown.",
  },
  {
    id: "borrow-drag",
    group: "health",
    label: "Borrow Cost Drag",
    target: "< 1.0% of NAV · hard cap 1.5%",
    unit: "%",
    kind: "max",
    green: 1.0,
    yellow: 1.5,
    cadence: "monthly",
    dataSource: "manual",
    note: "Total borrow cost as a share of NAV, annualized.",
  },
  {
    id: "turnover",
    group: "health",
    label: "Monthly Turnover",
    target: "< 25% of gross / month",
    unit: "%",
    kind: "max",
    green: 25,
    yellow: 35,
    cadence: "monthly",
    dataSource: "planned",
    note: "Turnover as a share of gross exposure per month.",
  },
  {
    id: "avg-correlation-long",
    group: "health",
    label: "Avg Pairwise Corr — Long",
    target: "< 0.40",
    unit: "ratio",
    kind: "max",
    green: 0.4,
    yellow: 0.55,
    cadence: "weekly",
    dataSource: "planned",
    note: "Average pairwise correlation within the long book.",
  },
  {
    id: "avg-correlation-short",
    group: "health",
    label: "Avg Pairwise Corr — Short",
    target: "< 0.40",
    unit: "ratio",
    kind: "max",
    green: 0.4,
    yellow: 0.55,
    cadence: "weekly",
    dataSource: "planned",
    note: "Average pairwise correlation within the short book.",
  },
  {
    id: "effective-bets-long",
    group: "health",
    label: "Effective Bets — Long",
    target: "> 12 per side",
    unit: "count",
    kind: "min",
    green: 12,
    yellow: 8,
    cadence: "weekly",
    dataSource: "live",
    note: "Diversification measure (inverse Herfindahl of within-book weights). More than 12 per side.",
  },
  {
    id: "effective-bets-short",
    group: "health",
    label: "Effective Bets — Short",
    target: "> 12 per side",
    unit: "count",
    kind: "min",
    green: 12,
    yellow: 8,
    cadence: "weekly",
    dataSource: "live",
    note: "Diversification measure (inverse Herfindahl of within-book weights). More than 12 per side.",
  },
  {
    id: "margin-buffer",
    group: "health",
    label: "Free Margin Buffer",
    target: "≥ 25% above maintenance",
    unit: "%",
    kind: "min",
    green: 25,
    yellow: 15,
    cadence: "daily",
    dataSource: "manual",
    note: "Free margin at least 25% above the maintenance requirement at all times.",
  },
  {
    id: "stress-worst-loss",
    group: "health",
    label: "Worst Stress Scenario",
    target: "loss ≤ 10% of NAV",
    unit: "%",
    kind: "max",
    green: 7,
    yellow: 10,
    cadence: "quarterly",
    dataSource: "planned",
    note: "Quarterly: −20% crash, +15% melt-up, 30% squeeze on the largest short. Any scenario worse than −10% of NAV flags, like a covenant breach in the loan's downside case.",
  },
  {
    id: "stale-data",
    group: "health",
    label: "Stale Data Check",
    target: "all prices current",
    unit: "count",
    kind: "max",
    green: 24,
    yellow: 24,
    cadence: "daily",
    dataSource: "live",
    note: "Binary — no yellow state. Green while every price is current; red the moment any price is older than one trading day. Everything else on this board is only as trustworthy as this check: a green board built on a dead data feed is worse than no board, because it produces false confidence instead of none. Value shown is hours since the oldest price update.",
  },
];

// Metrics wired to live computation in Phase 2 (analytics engine + risk-live).
// Flipping the tag here keeps the config the single source of truth.
const PHASE_2_LIVE = new Set<string>([
  "factor-size",
  "factor-value",
  "factor-momentum",
  "var-95",
  "cvar-95",
  "sortino",
  "r2-spx",
  "long-alpha",
  "short-alpha",
  "hit-rate",
  "slugging",
  "calmar",
  "turnover",
  "avg-correlation-long",
  "avg-correlation-short",
  "drawdown-from-high",
  "stress-worst-loss",
]);
for (const limit of RISK_LIMITS) {
  if (PHASE_2_LIVE.has(limit.id)) limit.dataSource = "live";
}

export const LIMITS_BY_ID: Record<string, RiskLimit> = Object.fromEntries(
  RISK_LIMITS.map((l) => [l.id, l]),
);

/**
 * Score a raw value against a limit. Returns "na" when there's nothing to score.
 */
export function evaluateLimit(limit: RiskLimit, value: number | null | undefined): RiskStatus {
  if (value == null || !Number.isFinite(value)) return "na";

  switch (limit.kind) {
    case "abs-band": {
      const v = Math.abs(value);
      if (v <= limit.green) return "green";
      if (v <= limit.yellow) return "yellow";
      return "red";
    }
    case "max": {
      if (value <= limit.green) return "green";
      if (value <= limit.yellow) return "yellow";
      return "red";
    }
    case "min": {
      if (value >= limit.green) return "green";
      if (value >= limit.yellow) return "yellow";
      return "red";
    }
    case "range": {
      // Asymmetric by design (gross exposure is the only user today): below
      // the green band is always yellow, uncapped — low gross means we've
      // quietly stopped deploying capital, not a breach of anything, so
      // there's no red floor on that side. Above green, yellow up to the
      // ceiling, red past it.
      const [gLow, gHigh] = limit.rangeGreen ?? [0, 0];
      const yHigh = limit.rangeYellow?.[1] ?? gHigh;
      if (value >= gLow && value <= gHigh) return "green";
      if (value < gLow) return "yellow";
      if (value <= yHigh) return "yellow";
      return "red";
    }
    default:
      return "na";
  }
}
