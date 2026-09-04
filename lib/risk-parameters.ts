/**
 * Garnet Fund — Wave 1 monitor definitions (Build Specification §4).
 *
 * What lives here: the *shape* of every monitor — its label, how it is
 * calculated, the IPS clause it traces to, who it notifies and when. What
 * does NOT live here: a single threshold. Those come from `lib/risk-config.ts`
 * at evaluation time, because §7's rule is that the Risk Manager can move any
 * limit without a code change.
 *
 * Two conventions from §4 are implemented once, here, so that no monitor gets
 * to disagree with another about what "at the limit" means:
 *
 *   Caps are compliant at exactly the cap and red strictly above, matching the
 *   IPS wording "over 10%". Yellow bands begin at their lower threshold
 *   inclusive. So a long at exactly 10.0% of NAV is yellow, 10.1% is red.
 *
 *   The 20–60% net band is inclusive: 20% and 60% are compliant (yellow), and
 *   red is strictly below 20% or strictly above 60%.
 *
 * The three-tier rule, likewise implemented once: green and yellow are
 * dashboard-only. Yellow changes the colour and opens an alert-log episode so
 * drift is visible as it builds, but it never notifies. Red is the only state
 * that sends anything.
 */
import { cfg, type ConfigKey, type RiskConfig } from "@/lib/risk-config";

export type RiskStatus = "green" | "yellow" | "red" | "na";

/**
 * Who a red notifies, per the §4.4 routing table. Yellow and green never
 * reach any of these.
 */
export type NotifyTier =
  /** Risk Manager, President, relevant PM — immediately on detection. */
  | "immediate"
  /** Risk Manager, President, Head of Operations — immediately. A debit is a
   *  tax-status issue (IRC §514), not only a risk issue. */
  | "immediate-ops"
  /** Risk Manager only, batched into one close-of-day message. */
  | "close"
  /** Risk Manager at close; President and Faculty Advisor once the Risk
   *  Manager confirms the breach. IPS VIII.b requires this specific chain. */
  | "close-chain"
  /** Never notifies — the monitor has no red tier at all. */
  | "none";

export const NOTIFY_RECIPIENTS: Record<Exclude<NotifyTier, "none">, string[]> = {
  immediate: ["Risk Manager", "President", "Relevant PM"],
  "immediate-ops": ["Risk Manager", "President", "Head of Operations"],
  close: ["Risk Manager"],
  "close-chain": ["Risk Manager", "President (after confirmation)", "Faculty Advisor (after confirmation)"],
};

export type MonitorGroup = "exposure" | "allocation" | "balance" | "options" | "governance";

export const MONITOR_GROUPS: { id: MonitorGroup; label: string; blurb: string }[] = [
  { id: "exposure", label: "Exposure & Volatility", blurb: "The three IPS II.c limits: gross, net, and the 12% volatility ceiling." },
  { id: "allocation", label: "Allocation & Concentration", blurb: "The 75/25 team split and the 15%-of-NAV sector cap inside the Equities book." },
  { id: "balance", label: "Balance Sheet", blurb: "Margin debit and tradable cash. A debit is a tax problem before it is a risk problem." },
  { id: "options", label: "Alternatives Greeks", blurb: "Theta and vega. Neither carries a numeric IPS limit, so neither can ever notify." },
  { id: "governance", label: "Governance", blurb: "The summer trading blackout." },
];

/**
 * How a monitor scores its value. Every variant reads its numbers from
 * config; none of them carries a literal.
 */
export type ScoreKind =
  /** Below a ceiling. red > cap; yellow ≥ warn; else green. */
  | "cap"
  /** Inside an inclusive band. red < min or > max; yellow < warnLow or ≥ warnHigh. */
  | "band"
  /** Inside a configured allocation band, yellow when near an edge from the inside. */
  | "allocation-band"
  /** Zero tolerance. red > tolerance; else green. */
  | "zero"
  /** A floor with no red tier — display only. yellow < floor; else green. */
  | "soft-floor"
  /** Positive is good, no red tier. yellow ≤ 0; else green. */
  | "positive-or-warn"
  /** Non-positive is good, no red tier. yellow > 0; else green. */
  | "non-positive-or-warn"
  /** A count of events. red > 0; else green. */
  | "event-count";

export type Monitor = {
  id: string;
  group: MonitorGroup;
  label: string;
  /** The §4.1 Calculation column, so the dashboard can show its own working. */
  calculation: string;
  source: string;
  unit: "%" | "$" | "$/day" | "count";
  kind: ScoreKind;
  /** Config keys this monitor scores against. Absent keys mean "unscored". */
  keys: {
    cap?: ConfigKey;
    warn?: ConfigKey;
    min?: ConfigKey;
    max?: ConfigKey;
    warnLow?: ConfigKey;
    warnHigh?: ConfigKey;
    bandLow?: ConfigKey;
    bandHigh?: ConfigKey;
    bandWarn?: ConfigKey;
  };
  notify: NotifyTier;
  /** Whether a red fires the moment it is detected or waits for the close. */
  timing: "intraday" | "close";
  note?: string;
};

/** §4.1 — the portfolio-level limit strip. One card per row. */
export const MONITORS: Monitor[] = [
  {
    id: "gross-exposure",
    group: "exposure",
    label: "Gross exposure",
    calculation: "(Σ |long MV| + Σ |short MV|) ÷ NAV. Options and futures enter at delta-adjusted notional.",
    source: "IPS II.c",
    unit: "%",
    kind: "cap",
    keys: { cap: "gross_cap", warn: "gross_yellow" },
    notify: "close",
    timing: "close",
    note: "Target 100% gross exposure. No leverage: the fund does not operate outside invested capital.",
  },
  {
    id: "net-exposure",
    group: "exposure",
    label: "Net exposure",
    calculation: "(Σ long MV − Σ |short MV|) ÷ NAV, delta-adjusted.",
    source: "IPS II.c",
    unit: "%",
    kind: "band",
    keys: { min: "net_min", max: "net_max", warnLow: "net_yellow_low", warnHigh: "net_yellow_high" },
    notify: "close",
    timing: "close",
    note: "Target band 20% to 60% net long, inclusive at both ends.",
  },
  {
    id: "annualized-volatility",
    group: "exposure",
    label: "Annualized volatility",
    calculation: "Std. dev. of daily fund returns × √252 over the configured trailing window.",
    source: "IPS II.c",
    unit: "%",
    kind: "cap",
    keys: { cap: "volatility_cap", warn: "volatility_yellow" },
    notify: "close",
    timing: "close",
    note: "Computed from the Fund's own stored daily NAV series, which is why §8 requires NAV capture to start at go-live.",
  },
  {
    id: "equities-allocation",
    group: "allocation",
    label: "Equities allocation",
    calculation: "Equities team capital at work ÷ NAV, against the 75% target.",
    source: "IPS II.a, VIII.a",
    unit: "%",
    kind: "allocation-band",
    keys: { bandLow: "equities_band_low", bandHigh: "equities_band_high", bandWarn: "allocation_band_warn_pts" },
    notify: "close-chain",
    timing: "close",
    note: "PENDING: the acceptable band around 75% referenced in IPS VIII.a is not yet defined. Until the Committee sets it, this card displays its value and declines to score it.",
  },
  {
    id: "alternatives-allocation",
    group: "allocation",
    label: "Alternatives allocation",
    calculation: "Alternatives team exposure ÷ NAV, with futures at beta-weighted dollar delta.",
    source: "IPS II.b",
    unit: "%",
    kind: "cap",
    keys: { cap: "alternatives_cap", warn: "alternatives_yellow" },
    // §4.4 lists "Alternatives exposure over 25%" under Risk Manager only, and
    // "Alternatives allocation outside its band" under the President/Faculty
    // chain. The 25% hard cap is the row implemented here, so it routes to the
    // Risk Manager; the band breach routes through equities-allocation.
    notify: "close",
    timing: "close",
    note: "Hard 25% exposure limit.",
  },
  {
    id: "sector-concentration",
    group: "allocation",
    label: "Sector concentration",
    calculation:
      "Highest of: gross exposure of Equities-team positions in a sector (Σ |long MV| + Σ |short MV|) ÷ NAV. Alternatives positions are excluded.",
    source: "IPS VI; sector cap approved 9/2/26",
    unit: "%",
    kind: "cap",
    keys: { cap: "sector_cap", warn: "sector_yellow" },
    notify: "close",
    timing: "close",
    note: "Measured on gross exposure per sector, consistent with every other IPS limit. Net exposure by sector is displayed alongside for information but is not limited.",
  },
  {
    id: "margin-debit",
    group: "balance",
    label: "Margin debit balance",
    calculation: "Direct pull from the broker as a discrete field, not derived from the cash balance.",
    source: "IPS II.c; tax structure",
    unit: "$",
    kind: "zero",
    keys: { cap: "margin_debit_tolerance" },
    notify: "immediate-ops",
    timing: "intraday",
    note: "Zero tolerance. A debit balance is acquisition indebtedness under IRC §514 and creates UBTI exposure, which is why this escalates to Operations.",
  },
  {
    id: "cash-available",
    group: "balance",
    label: "Cash available to trade",
    calculation: "Excess liquidity ÷ NAV, from the broker.",
    source: "Risk Manager operating control",
    unit: "%",
    kind: "soft-floor",
    keys: { min: "cash_floor_pct" },
    notify: "none",
    timing: "close",
    note: "Leading indicator for a debit balance. Display only — no red tier, so it never notifies.",
  },
  {
    id: "alternatives-theta",
    group: "options",
    label: "Alternatives net theta",
    calculation: "Σ theta across Alternatives options positions, in dollars per day. Scored on the 20-day average.",
    source: "IPS III.b",
    unit: "$/day",
    kind: "positive-or-warn",
    keys: {},
    notify: "none",
    timing: "close",
    note: "The IPS requirement is positive theta on average, so the tier is judged on the 20-day average rather than the day's reading. No numeric limit exists, so there is no red tier and this can never notify.",
  },
  {
    id: "alternatives-vega",
    group: "options",
    label: "Alternatives net vega",
    calculation: "Σ vega across Alternatives options positions.",
    source: "IPS III.b",
    unit: "$",
    kind: "non-positive-or-warn",
    keys: { cap: "net_vega_cap" },
    notify: "none",
    timing: "close",
    note: "PENDING: no numeric cap is defined in the IPS. Shows the value and flags if net long.",
  },
  {
    id: "trading-calendar",
    group: "governance",
    label: "Trading calendar",
    calculation:
      "Count of trades executed between the last day of Spring semester and the first day of Fall semester.",
    source: "Gov. VIII.c",
    unit: "count",
    kind: "event-count",
    keys: {},
    notify: "immediate",
    timing: "intraday",
    note: "Blackout dates are entered per university calendar each year. With no dates configured this reports 'not configured' rather than a false all-clear.",
  },
];

export const MONITORS_BY_ID: Record<string, Monitor> = Object.fromEntries(
  MONITORS.map((m) => [m.id, m]),
);

// ── §4.2 position-level rules ────────────────────────────────────────────

export type PositionRuleId =
  | "long-size"
  | "short-size"
  | "pnl-vs-cost"
  | "stop-order-present"
  | "stop-loss-status"
  | "position-var-share"
  | "price-target"
  | "days-to-expiry"
  | "defined-risk-max-loss";

export type PositionRule = {
  id: PositionRuleId;
  label: string;
  source: string;
  notify: NotifyTier;
  timing: "intraday" | "close";
  /** Whether this rule has a red tier at all. */
  hasRed: boolean;
  note: string;
};

export const POSITION_RULES: PositionRule[] = [
  {
    id: "long-size",
    label: "Long position size",
    source: "IPS III.b, IV.c step 6",
    notify: "immediate",
    timing: "intraday",
    hasRed: true,
    note: "Market value ÷ NAV. Where the limit is exceeded, exposure must be reduced below the cap immediately.",
  },
  {
    id: "short-size",
    label: "Short position size",
    source: "IPS III.b; short cap approved 9/2/26",
    notify: "immediate",
    timing: "intraday",
    hasRed: true,
    note: "|Market value| ÷ NAV. Capped tighter than a long because an adverse move expands a short while a long self-limits.",
  },
  {
    id: "pnl-vs-cost",
    label: "P&L vs cost",
    source: "IPS III.d",
    notify: "close",
    timing: "close",
    hasRed: true,
    note: "(Market value − cost basis) ÷ cost basis, sign-corrected for shorts. The yellow tier is the last point at which a decision can still be made; past the red, the broker has already acted.",
  },
  {
    id: "stop-order-present",
    label: "Stop order present",
    source: "IPS III.d; mechanism approved 9/2/26",
    notify: "immediate",
    timing: "intraday",
    hasRed: true,
    note: "A resting stop must exist for every position at the correct side, quantity, and a trigger within tolerance of the stop level. A missing, partial, or mispriced stop is red because an unprotected position is invisible until it matters.",
  },
  {
    id: "stop-loss-status",
    label: "Stop-loss status",
    source: "IPS III.d, V.a",
    notify: "immediate",
    timing: "intraday",
    hasRed: true,
    note: "The broker executes the resting stop automatically. This is confirmation of an execution that already occurred, not an action prompt.",
  },
  {
    id: "position-var-share",
    label: "Position VaR share",
    source: "IPS III.d (replacement approved in principle 9/2/26)",
    notify: "close",
    timing: "close",
    hasRed: true,
    note: "Standalone one-day 95% VaR of the position ÷ total Fund one-day 95% VaR. A concentration limit by risk rather than by size: a full-size position in a quiet name passes, the same size in a volatile one is flagged and must be sized down.",
  },
  {
    id: "price-target",
    label: "Price target",
    source: "IPS V.a",
    notify: "none",
    timing: "close",
    hasRed: false,
    note: "A position at or above its thesis price target shows REVIEW and routes to Investment Committee gain monitoring. Yellow only — it never notifies.",
  },
  {
    id: "days-to-expiry",
    label: "Days to expiry",
    source: "IPS III.b",
    notify: "none",
    timing: "close",
    hasRed: false,
    note: "Long-premium options only. Inside the approval window without the Risk Manager's approval flag is yellow. Yellow only — it never notifies.",
  },
  {
    id: "defined-risk-max-loss",
    label: "Defined-risk max loss",
    source: "IPS II.b",
    notify: "close",
    timing: "close",
    hasRed: true,
    note: "Alternatives only, from the Risk Manager entry form, in dollars.",
  },
];

export const POSITION_RULES_BY_ID: Record<string, PositionRule> = Object.fromEntries(
  POSITION_RULES.map((r) => [r.id, r]),
);

// ── Scoring ───────────────────────────────────────────────────────────────

/**
 * Scores one monitor's value against the live config.
 *
 * Returns "na" whenever the value is missing OR the limit it needs is
 * undecided (§8). That second case matters: an unscored monitor still shows
 * its number, it just refuses to claim the number is compliant.
 */
export function scoreMonitor(
  monitor: Monitor,
  value: number | null | undefined,
  config: RiskConfig,
): RiskStatus {
  if (value == null || !Number.isFinite(value)) return "na";
  const k = monitor.keys;
  const at = (key: ConfigKey | undefined) => (key ? cfg(config, key) : null);

  switch (monitor.kind) {
    case "cap": {
      const cap = at(k.cap);
      const warn = at(k.warn);
      if (cap == null) return "na";
      // Compliant at exactly the cap, red strictly above ["over 10%"].
      if (value > cap) return "red";
      // Yellow bands begin at their lower threshold inclusive.
      if (warn != null && value >= warn) return "yellow";
      return "green";
    }
    case "band": {
      const min = at(k.min);
      const max = at(k.max);
      if (min == null || max == null) return "na";
      // Inclusive band: 20% and 60% are compliant, red strictly outside.
      if (value < min || value > max) return "red";
      const warnLow = at(k.warnLow);
      const warnHigh = at(k.warnHigh);
      if (warnLow != null && value < warnLow) return "yellow";
      if (warnHigh != null && value >= warnHigh) return "yellow";
      return "green";
    }
    case "allocation-band": {
      const low = at(k.bandLow);
      const high = at(k.bandHigh);
      // The whole point of the PENDING marker: with no band, no verdict.
      if (low == null || high == null) return "na";
      if (value < low || value > high) return "red";
      const warnPts = at(k.bandWarn) ?? 0;
      if (value - low <= warnPts || high - value <= warnPts) return "yellow";
      return "green";
    }
    case "zero": {
      const tolerance = at(k.cap) ?? 0;
      return value > tolerance ? "red" : "green";
    }
    case "soft-floor": {
      const floor = at(k.min);
      if (floor == null) return "na";
      return value < floor ? "yellow" : "green";
    }
    case "positive-or-warn":
      return value > 0 ? "green" : "yellow";
    case "non-positive-or-warn": {
      // Once the Committee sets a numeric vega cap this becomes a real ceiling;
      // until then, net long is the only thing we can honestly flag.
      const cap = at(k.cap);
      if (cap != null) return value > cap ? "red" : value > 0 ? "yellow" : "green";
      return value > 0 ? "yellow" : "green";
    }
    case "event-count":
      return value > 0 ? "red" : "green";
    default:
      return "na";
  }
}

/** A one-line rendering of what a monitor is currently scored against. */
export function describeLimit(monitor: Monitor, config: RiskConfig): string {
  const at = (key: ConfigKey | undefined) => (key ? cfg(config, key) : null);
  const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

  switch (monitor.kind) {
    case "cap": {
      const cap = at(monitor.keys.cap);
      if (cap == null) return "No limit set";
      return monitor.unit === "$" ? `≤ $${cap.toLocaleString("en-US")}` : `≤ ${pct(cap)}`;
    }
    case "band": {
      const min = at(monitor.keys.min);
      const max = at(monitor.keys.max);
      return min == null || max == null ? "No band set" : `${pct(min)} – ${pct(max)}`;
    }
    case "allocation-band": {
      const low = at(monitor.keys.bandLow);
      const high = at(monitor.keys.bandHigh);
      return low == null || high == null ? "Band not set (PENDING)" : `${pct(low)} – ${pct(high)}`;
    }
    case "zero":
      return "Zero tolerance";
    case "soft-floor": {
      const floor = at(monitor.keys.min);
      return floor == null ? "No floor set" : `≥ ${pct(floor)}`;
    }
    case "positive-or-warn":
      return "Positive on 20-day average";
    case "non-positive-or-warn": {
      const cap = at(monitor.keys.cap);
      return cap == null ? "Not net long (no cap set)" : `≤ $${cap.toLocaleString("en-US")}`;
    }
    case "event-count":
      return "No trades in blackout";
    default:
      return "—";
  }
}

export function formatMonitorValue(monitor: Monitor, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (monitor.unit) {
    case "%":
      return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
    case "$":
      return `${value < 0 ? "−" : ""}$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
    case "$/day":
      return `${value < 0 ? "−" : ""}$${Math.abs(Math.round(value)).toLocaleString("en-US")}/day`;
    case "count":
      return String(Math.round(value));
    default:
      return String(value);
  }
}
