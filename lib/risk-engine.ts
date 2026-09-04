/**
 * Garnet Fund — Wave 1 risk engine.
 *
 * Pure functions only: everything here turns an already-fetched book into the
 * numbers on Tab 1 and Tab 2. No I/O, so the same code scores a live book, a
 * stored snapshot being rebuilt for an audit, and a test fixture.
 *
 * §6 Calculation conventions are implemented once, here, so that a number on
 * Tab 1 always agrees with the same number on Tab 2:
 *
 *   NAV is computed once and stored; every percentage limit divides by that
 *   stored value. "Total fund size" (IPS) and "AUM" (Governance) are the
 *   same quantity.
 *
 *   Options enter exposure at delta × underlying × multiplier × contracts.
 *   Futures at dollar delta beta-weighted to the S&P 500; commodity futures at
 *   raw notional, excluded from beta-weighting but still inside the 25%.
 *   Bonds at market value.
 *
 *   Shorts carry a negative market value, and P&L vs cost is computed so that
 *   a rise in the shorted price is a loss.
 *
 * Where an input is genuinely unavailable from the feed, the position records
 * *that* rather than a plausible substitute, and the affected monitor reports
 * its degradation. §3: "Fields must not be silently approximated."
 */
import type { LivePosition } from "@/lib/types";
import {
  MONITORS,
  MONITOR_GROUPS,
  POSITION_RULES_BY_ID,
  describeLimit,
  formatMonitorValue,
  scoreMonitor,
  type Monitor,
  type MonitorGroup,
  type PositionRuleId,
  type RiskStatus,
} from "@/lib/risk-parameters";
import { cfg, type RiskConfig } from "@/lib/risk-config";

export type PositionSide = "long" | "short";
export type Team = "equities" | "alternatives";
export type AssetClass = "Equity" | "Option" | "Future" | "Fixed Income" | "Cash";

/** A position with an explicit side; falls back to the sign of market value. */
export type SidedPosition = LivePosition & { side?: PositionSide };

export function sideOf(p: SidedPosition): PositionSide {
  if (p.side) return p.side;
  if (p.marketValue < 0 || p.quantity < 0) return "short";
  return "long";
}

/** §3.4 fields, as stored on `position_approvals`. */
export type PositionApproval = {
  id: string;
  symbol: string;
  team: Team | null;
  sector: string | null;
  approved_size_pct: number | null;
  approval_date: string | null;
  approved_by: string | null;
  monitoring_conditions: string | null;
  stop_order_confirmed: boolean;
  stop_order_ref: string | null;
  defined_risk_max_loss: number | null;
  price_target: number | null;
  analyst_id: string | null;
  analyst_name?: string | null;
  thesis_driven: boolean;
  short_expiry_approved: boolean;
  gain_unrelated_to_thesis: boolean;
  notes: string | null;
};

/** A resting or filled broker order, normalized out of the Schwab payload. */
export type BrokerOrder = {
  symbol: string;
  /** BUY, SELL, BUY_TO_COVER, SELL_SHORT … as the broker reports it. */
  instruction: string;
  orderType: string;
  status: string;
  quantity: number;
  filledQuantity: number;
  stopPrice: number | null;
  price: number | null;
  duration: string;
  enteredAt: string | null;
  closedAt: string | null;
  orderId: string | null;
};

/** Option contract details, when the instrument is one. */
export type OptionDetail = {
  underlying: string | null;
  strike: number | null;
  expiry: string | null;
  putCall: "PUT" | "CALL" | null;
  /** Per-contract greeks. null means the feed did not supply them — see the
   *  file header on why we never substitute a model value silently. */
  delta: number | null;
  theta: number | null;
  vega: number | null;
  multiplier: number;
  /** True for a long-premium position (a bought put or call). */
  longPremium: boolean;
};

// ── Classification ────────────────────────────────────────────────────────

export function assetClassOf(schwabAssetType: string): AssetClass {
  switch (schwabAssetType.toUpperCase()) {
    case "OPTION":
      return "Option";
    case "FUTURE":
    case "FUTURE_OPTION":
      return "Future";
    case "FIXED_INCOME":
    case "BOND":
      return "Fixed Income";
    case "CASH_EQUIVALENT":
    case "CURRENCY":
      return "Cash";
    default:
      return "Equity";
  }
}

/**
 * Every position is tagged to exactly one team [IPS II.a, II.b]. The feed
 * carries no such field, so the Risk Manager's approval row is authoritative
 * and asset class is the fallback: Alternatives is defined by the IPS as
 * equity and index options, fixed income, and cash-settled futures.
 */
export function teamOf(assetClass: AssetClass, approval: PositionApproval | undefined): Team {
  if (approval?.team) return approval.team;
  return assetClass === "Equity" ? "equities" : "alternatives";
}

/**
 * Maps a GICS (or FMP) sector name onto the seven sectors IPS VI requires the
 * equity groups to cover, plus "Other".
 *
 * The IPS list is not GICS — it names Media and Telecom separately where GICS
 * folds both into Communication Services, and Financial Institutions where
 * GICS says Financial Services. Anything that does not map lands in Other,
 * which still counts toward the sector cap: an unclassified 16% bet is a
 * concentration whether or not we know what to call it.
 */
const SECTOR_ALIASES: Record<string, string> = {
  "information technology": "Technology",
  technology: "Technology",
  tech: "Technology",
  "health care": "Healthcare",
  healthcare: "Healthcare",
  "financial services": "Financial Institutions",
  financials: "Financial Institutions",
  "financial institutions": "Financial Institutions",
  industrials: "Industrials",
  "capital goods": "Industrials",
  "communication services": "Media",
  "communication service": "Media",
  media: "Media",
  entertainment: "Media",
  telecom: "Telecom",
  telecommunications: "Telecom",
  "telecommunication services": "Telecom",
  "consumer cyclical": "Consumer",
  "consumer defensive": "Consumer",
  "consumer discretionary": "Consumer",
  "consumer staples": "Consumer",
  consumer: "Consumer",
};

export const OTHER_SECTOR = "Other";

export function mapSector(
  raw: string | null | undefined,
  coverageSectors: string[],
  approval: PositionApproval | undefined,
): string {
  const override = approval?.sector;
  if (override && coverageSectors.includes(override)) return override;
  if (override) return override;
  if (!raw) return OTHER_SECTOR;
  if (coverageSectors.includes(raw)) return raw;
  const mapped = SECTOR_ALIASES[raw.trim().toLowerCase()];
  if (mapped && coverageSectors.includes(mapped)) return mapped;
  return OTHER_SECTOR;
}

// ── Exposure ──────────────────────────────────────────────────────────────

/** How a position's exposure figure was arrived at, so the UI can say so. */
export type ExposureBasis =
  /** Equities and bonds: market value, exactly as §6 requires. */
  | "market-value"
  /** Options: delta × underlying × multiplier × contracts. */
  | "delta-adjusted"
  /** Futures: dollar delta, beta-weighted to the S&P 500. */
  | "beta-weighted"
  /** Commodity futures: raw notional, excluded from beta-weighting. */
  | "raw-notional"
  /** The feed did not supply the greek or beta this position needs. Market
   *  value is shown, and the affected monitors report themselves degraded. */
  | "unavailable";

export type EnrichedPosition = {
  symbol: string;
  name: string;
  side: PositionSide;
  team: Team;
  assetClass: AssetClass;
  sector: string;
  quantity: number;
  /** Absolute contract/share count. */
  absQuantity: number;
  price: number;
  avgCost: number;
  costBasis: number;
  marketValue: number;
  /** Signed exposure per §6 — positive long, negative short. */
  exposure: number;
  exposureBasis: ExposureBasis;
  /** |exposure| ÷ NAV, as a percentage. */
  weightPct: number;
  /** (MV − cost) ÷ cost, sign-corrected for shorts. Negative is a loss. */
  pnlVsCostPct: number | null;
  unrealizedPnl: number;
  dayPnl: number;
  entryDate: string | null;
  option: OptionDetail | null;
  maturityDate: string | null;
  approval: PositionApproval | null;
};

export type ExposureMetrics = {
  nav: number;
  grossPct: number;
  netPct: number;
  longExposure: number;
  shortExposure: number;
  equitiesPct: number;
  alternativesPct: number;
  cashPct: number;
  positionCount: number;
  /** Positions whose exposure could not be computed as §6 requires. */
  degraded: string[];
};

export function computeExposure(positions: EnrichedPosition[], nav: number): ExposureMetrics {
  const pct = (v: number) => (nav > 0 ? (v / nav) * 100 : 0);
  const invested = positions.filter((p) => p.assetClass !== "Cash");

  let longExposure = 0;
  let shortExposure = 0;
  let equities = 0;
  let alternatives = 0;
  const degraded: string[] = [];

  for (const p of invested) {
    const abs = Math.abs(p.exposure);
    if (p.exposure >= 0) longExposure += abs;
    else shortExposure += abs;
    if (p.team === "equities") equities += abs;
    else alternatives += abs;
    if (p.exposureBasis === "unavailable") degraded.push(p.symbol);
  }

  const cash = positions
    .filter((p) => p.assetClass === "Cash")
    .reduce((s, p) => s + p.marketValue, 0);

  return {
    nav,
    grossPct: pct(longExposure + shortExposure),
    netPct: pct(longExposure - shortExposure),
    longExposure,
    shortExposure,
    equitiesPct: pct(equities),
    alternativesPct: pct(alternatives),
    cashPct: pct(cash),
    positionCount: invested.length,
    degraded,
  };
}

// ── Sector concentration (§4.1, Equities book only) ───────────────────────

export type SectorRow = {
  sector: string;
  longPct: number;
  shortPct: number;
  /** (Σ |long| + Σ |short|) ÷ NAV — the figure the 15% cap is measured on. */
  grossPct: number;
  /** Displayed alongside for information; not limited [§8 Sector cap basis]. */
  netPct: number;
};

/**
 * Sector exposure across the Equities book. Alternatives positions are
 * excluded by the spec, so a sector can be over 15% in the fund overall
 * without breaching — the cap is specifically on the Equities team's book.
 */
export function computeSectorExposure(
  positions: EnrichedPosition[],
  nav: number,
  coverageSectors: string[],
): SectorRow[] {
  const map = new Map<string, { long: number; short: number }>();
  for (const sector of [...coverageSectors, OTHER_SECTOR]) {
    map.set(sector, { long: 0, short: 0 });
  }

  for (const p of positions) {
    if (p.team !== "equities" || p.assetClass === "Cash") continue;
    const entry = map.get(p.sector) ?? { long: 0, short: 0 };
    if (p.exposure >= 0) entry.long += Math.abs(p.exposure);
    else entry.short += Math.abs(p.exposure);
    map.set(p.sector, entry);
  }

  const pct = (v: number) => (nav > 0 ? (v / nav) * 100 : 0);
  return [...map.entries()]
    .map(([sector, { long, short }]) => ({
      sector,
      longPct: pct(long),
      shortPct: pct(short),
      grossPct: pct(long + short),
      netPct: pct(long - short),
    }))
    .sort((a, b) => b.grossPct - a.grossPct);
}

// ── Greeks (§4.1 Alternatives theta / vega) ───────────────────────────────

export type GreeksTotals = {
  netTheta: number | null;
  netVega: number | null;
  /** Contracts whose greeks the feed did not supply. */
  missing: string[];
};

export function computeGreeks(positions: EnrichedPosition[]): GreeksTotals {
  const options = positions.filter((p) => p.team === "alternatives" && p.option);
  if (!options.length) return { netTheta: null, netVega: null, missing: [] };

  let theta = 0;
  let vega = 0;
  let sawTheta = false;
  let sawVega = false;
  const missing: string[] = [];

  for (const p of options) {
    const o = p.option!;
    // A short contract's greeks reverse sign: selling a call is short vega.
    const signedContracts = p.side === "short" ? -p.absQuantity : p.absQuantity;
    if (o.theta == null || o.vega == null) {
      missing.push(p.symbol);
      continue;
    }
    theta += o.theta * signedContracts * o.multiplier;
    vega += o.vega * signedContracts * o.multiplier;
    sawTheta = true;
    sawVega = true;
  }

  return {
    netTheta: sawTheta ? theta : null,
    netVega: sawVega ? vega : null,
    missing,
  };
}

// ── Stop orders (§4.2) ────────────────────────────────────────────────────

export type StopCheck =
  | "ok"
  | "missing"
  | "partial"
  | "mispriced"
  | "executed"
  /** The Alternatives book, while §8's open item about applying the −30% stop
   *  to options is unresolved and the config has the check switched off. */
  | "not-applicable"
  /** Open orders could not be read, so we cannot claim a stop is present. */
  | "unknown";

const RESTING_STATUSES = new Set([
  "WORKING",
  "ACCEPTED",
  "QUEUED",
  "PENDING_ACTIVATION",
  "AWAITING_CONDITION",
  "OPEN",
]);

/** The trigger price a compliant resting stop must sit at, per §2 / §7. */
export function expectedStopPrice(
  side: PositionSide,
  avgCost: number,
  stopPct: number,
): number {
  // 30% below cost for a long; 30% above the short-sale price for a short.
  return side === "long" ? avgCost * (1 - stopPct / 100) : avgCost * (1 + stopPct / 100);
}

function closesPosition(side: PositionSide, instruction: string): boolean {
  const i = instruction.toUpperCase();
  return side === "long" ? i.startsWith("SELL") : i.startsWith("BUY");
}

/**
 * Matches a position against the account's open orders. A missing, partial,
 * or mispriced stop is red: an unprotected position is invisible until it
 * matters.
 */
export function checkStopOrder(
  position: EnrichedPosition,
  orders: BrokerOrder[] | null,
  config: RiskConfig,
): { state: StopCheck; order: BrokerOrder | null; expected: number | null } {
  const stopPct = cfg(config, "stop_loss_pct");
  const tolerance = cfg(config, "stop_order_tolerance_pct") ?? 1;
  const coversAlternatives = (cfg(config, "stop_applies_to_alternatives") ?? 0) > 0;

  if (position.assetClass === "Cash") return { state: "not-applicable", order: null, expected: null };
  if (position.team === "alternatives" && !coversAlternatives) {
    return { state: "not-applicable", order: null, expected: null };
  }
  if (stopPct == null) return { state: "unknown", order: null, expected: null };
  // No order feed means no evidence, and no evidence is not the same as a
  // clean bill of health — hence "unknown" rather than "ok".
  if (orders == null) return { state: "unknown", order: null, expected: null };

  const expected = expectedStopPrice(position.side, position.avgCost, stopPct);

  const candidates = orders.filter(
    (o) =>
      o.symbol === position.symbol &&
      o.orderType.toUpperCase().includes("STOP") &&
      closesPosition(position.side, o.instruction),
  );

  const resting = candidates.filter((o) => RESTING_STATUSES.has(o.status.toUpperCase()));
  if (!resting.length) return { state: "missing", order: null, expected };

  // Several partial stops can legitimately add up to full cover.
  const covered = resting.reduce((s, o) => s + Math.abs(o.quantity), 0);
  const best = resting.reduce((a, b) =>
    Math.abs((a.stopPrice ?? 0) - expected) <= Math.abs((b.stopPrice ?? 0) - expected) ? a : b,
  );

  if (covered + 1e-6 < position.absQuantity) return { state: "partial", order: best, expected };

  const trigger = best.stopPrice;
  if (trigger == null) return { state: "mispriced", order: best, expected };
  const drift = Math.abs(trigger - expected) / expected * 100;
  if (drift > tolerance) return { state: "mispriced", order: best, expected };

  return { state: "ok", order: best, expected };
}

/**
 * A stop that already fired. Detected from filled stop orders rather than
 * inferred from the position vanishing, because a position can also leave the
 * book through a normal committee-approved exit.
 */
export function detectStopExecution(symbol: string, side: PositionSide, orders: BrokerOrder[] | null): BrokerOrder | null {
  if (!orders) return null;
  const filled = orders.filter(
    (o) =>
      o.symbol === symbol &&
      o.orderType.toUpperCase().includes("STOP") &&
      o.status.toUpperCase() === "FILLED" &&
      o.filledQuantity > 0 &&
      closesPosition(side, o.instruction),
  );
  if (!filled.length) return null;
  return filled.reduce((a, b) => ((a.closedAt ?? "") >= (b.closedAt ?? "") ? a : b));
}

// ── Position rule evaluation (§4.2) ───────────────────────────────────────

export type RuleResult = {
  id: PositionRuleId;
  status: RiskStatus;
  /** What to show in the cell. */
  display: string;
  /** The numeric reading behind it, where there is one. */
  value: number | null;
};

export type PositionRow = {
  position: EnrichedPosition;
  rules: Record<PositionRuleId, RuleResult>;
  /** Worst status across every rule on the row, for sorting and filtering. */
  worst: RiskStatus;
  stop: { state: StopCheck; expected: number | null; orderRef: string | null };
  /** A stopped position pins to the top of the table [§4.2]. */
  stopped: boolean;
  /** Standalone one-day 95% VaR of the position, in dollars. */
  var95: number | null;
  varSharePct: number | null;
  daysToExpiry: number | null;
  distanceToTargetPct: number | null;
};

const STATUS_RANK: Record<RiskStatus, number> = { red: 3, yellow: 2, green: 1, na: 0 };

function worstOf(statuses: RiskStatus[]): RiskStatus {
  return statuses.reduce((a, b) => (STATUS_RANK[b] > STATUS_RANK[a] ? b : a), "na" as RiskStatus);
}

function rule(id: PositionRuleId, status: RiskStatus, display: string, value: number | null = null): RuleResult {
  return { id, status, display, value };
}

export function daysUntil(dateIso: string | null, now: Date): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export function evaluatePosition(params: {
  position: EnrichedPosition;
  orders: BrokerOrder[] | null;
  config: RiskConfig;
  var95: number | null;
  fundVar95: number | null;
  now: Date;
}): PositionRow {
  const { position: p, orders, config, var95, fundVar95, now } = params;
  const isLong = p.side === "long";

  // ── Size caps ──────────────────────────────────────────────────────────
  const cap = cfg(config, isLong ? "long_cap" : "short_cap");
  const warn = cfg(config, isLong ? "long_yellow" : "short_yellow");
  const sizeStatus: RiskStatus =
    cap == null
      ? "na"
      : p.weightPct > cap
        ? "red"
        : warn != null && p.weightPct >= warn
          ? "yellow"
          : "green";
  const sizeDisplay = `${p.weightPct.toFixed(2)}%`;

  // ── P&L vs cost / stop level ───────────────────────────────────────────
  const stopPct = cfg(config, "stop_loss_pct");
  const warnPct = cfg(config, "stop_warn_pct");
  const pnl = p.pnlVsCostPct;
  const pnlStatus: RiskStatus =
    pnl == null || stopPct == null
      ? "na"
      : // Fires at a decline of 30% or more, so exactly −30% is red.
        pnl <= -stopPct
        ? "red"
        : warnPct != null && pnl <= -warnPct
          ? "yellow"
          : "green";

  // ── Stop order ─────────────────────────────────────────────────────────
  const stop = checkStopOrder(p, orders, config);
  const stopStatus: RiskStatus =
    stop.state === "ok"
      ? "green"
      : stop.state === "not-applicable" || stop.state === "unknown"
        ? "na"
        : "red";
  const STOP_LABEL: Record<StopCheck, string> = {
    ok: "Present",
    missing: "Missing",
    partial: "Partial cover",
    mispriced: "Mispriced",
    executed: "Executed",
    "not-applicable": "n/a",
    unknown: "No order feed",
  };

  // ── Stop-loss status ───────────────────────────────────────────────────
  const execution = detectStopExecution(p.symbol, p.side, orders);
  const stopped = execution != null;
  const statusResult = rule(
    "stop-loss-status",
    stopped ? "red" : "green",
    stopped ? "STOPPED" : "Not triggered",
  );

  // ── Position VaR share ─────────────────────────────────────────────────
  const varShare =
    var95 != null && fundVar95 != null && fundVar95 > 0 ? (var95 / fundVar95) * 100 : null;
  const varCap = cfg(config, "position_var_share_cap");
  const varWarn = cfg(config, "position_var_share_yellow");
  const varStatus: RiskStatus =
    varShare == null || varCap == null
      ? "na"
      : varShare > varCap
        ? "red"
        : varWarn != null && varShare >= varWarn
          ? "yellow"
          : "green";

  // ── Price target ───────────────────────────────────────────────────────
  const target = p.approval?.price_target ?? null;
  const distanceToTargetPct =
    target != null && target > 0 && p.price > 0 ? ((p.price - target) / target) * 100 : null;
  // A short's thesis target sits below the entry price, so "reached" is the
  // price falling to it rather than rising to it.
  const reachedTarget =
    target == null ? false : isLong ? p.price >= target : p.price <= target;
  const targetStatus: RiskStatus = target == null ? "na" : reachedTarget ? "yellow" : "green";

  // ── Days to expiry ─────────────────────────────────────────────────────
  const window = cfg(config, "option_expiry_window_days");
  const daysToExpiry = daysUntil(p.option?.expiry ?? null, now);
  const approvedShortExpiry = p.approval?.short_expiry_approved ?? false;
  const expiryStatus: RiskStatus =
    !p.option || !p.option.longPremium || daysToExpiry == null || window == null
      ? "na"
      : daysToExpiry <= window && !approvedShortExpiry
        ? "yellow"
        : "green";

  // ── Defined-risk max loss ──────────────────────────────────────────────
  const maxLoss = p.approval?.defined_risk_max_loss ?? null;
  const loss = p.unrealizedPnl < 0 ? Math.abs(p.unrealizedPnl) : 0;
  const maxLossStatus: RiskStatus =
    maxLoss == null || p.team !== "alternatives" ? "na" : loss >= maxLoss ? "red" : "green";

  const rules: Record<PositionRuleId, RuleResult> = {
    "long-size": isLong ? rule("long-size", sizeStatus, sizeDisplay, p.weightPct) : rule("long-size", "na", "—"),
    "short-size": !isLong ? rule("short-size", sizeStatus, sizeDisplay, p.weightPct) : rule("short-size", "na", "—"),
    "pnl-vs-cost": rule(
      "pnl-vs-cost",
      pnlStatus,
      pnl == null ? "—" : `${pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(1)}%`,
      pnl,
    ),
    "stop-order-present": rule("stop-order-present", stopStatus, STOP_LABEL[stop.state]),
    "stop-loss-status": statusResult,
    "position-var-share": rule(
      "position-var-share",
      varStatus,
      varShare == null ? "—" : `${varShare.toFixed(0)}%`,
      varShare,
    ),
    "price-target": rule(
      "price-target",
      targetStatus,
      target == null ? "—" : reachedTarget ? "REVIEW" : `$${target.toFixed(2)}`,
      distanceToTargetPct,
    ),
    "days-to-expiry": rule(
      "days-to-expiry",
      expiryStatus,
      daysToExpiry == null ? "—" : `${daysToExpiry}d`,
      daysToExpiry,
    ),
    "defined-risk-max-loss": rule(
      "defined-risk-max-loss",
      maxLossStatus,
      maxLoss == null ? "—" : `$${Math.round(loss).toLocaleString("en-US")} / $${Math.round(maxLoss).toLocaleString("en-US")}`,
      maxLoss == null ? null : loss,
    ),
  };

  return {
    position: p,
    rules,
    worst: worstOf(Object.values(rules).map((r) => r.status)),
    stop: { state: stop.state, expected: stop.expected, orderRef: stop.order?.orderId ?? null },
    stopped,
    var95,
    varSharePct: varShare,
    daysToExpiry,
    distanceToTargetPct,
  };
}

/** Stopped positions pin to the top; then reds, then yellows, then by size. */
export function sortPositionRows(rows: PositionRow[]): PositionRow[] {
  return [...rows].sort((a, b) => {
    if (a.stopped !== b.stopped) return a.stopped ? -1 : 1;
    const rank = STATUS_RANK[b.worst] - STATUS_RANK[a.worst];
    if (rank !== 0) return rank;
    return b.position.weightPct - a.position.weightPct;
  });
}

// ── Model assembly ────────────────────────────────────────────────────────

export type MonitorRow = {
  monitor: Monitor;
  value: number | null;
  display: string;
  limitText: string;
  status: RiskStatus;
  /** Grey, per §1 rule 2: the feed is older than the staleness threshold. */
  stale: boolean;
  /** Why the reading is missing or partial, when it is. */
  degradedReason: string | null;
  /** Extra context under the number, e.g. which sector is highest. */
  detail: string | null;
};

export type DataFeed = {
  label: string;
  ok: boolean;
  asOf: string | null;
  note?: string;
};

export type RiskModel = {
  asOf: string;
  hasLiveData: boolean;
  nav: number | null;
  navAsOf: string | null;
  exposure: ExposureMetrics | null;
  sectors: SectorRow[];
  monitors: { group: MonitorGroup; label: string; blurb: string; rows: MonitorRow[] }[];
  positions: PositionRow[];
  counts: Record<RiskStatus, number>;
  /** Every red across both the limit strip and the position table. */
  breaches: { monitorId: string; label: string; subject: string | null; display: string; limitText: string }[];
  /** Fund one-day 95% VaR, in dollars and as % of NAV. */
  fundVar: { dollars: number | null; pct: number | null; observations: number } | null;
  /** §1 rule 2: every number carries a visible source and an as-of stamp. */
  feeds: DataFeed[];
  config: RiskConfig;
};

export type MonitorValueMap = Partial<Record<string, number | null>>;

export function buildRiskModel(input: {
  asOf: string;
  hasLiveData: boolean;
  nav: number | null;
  navAsOf: string | null;
  exposure: ExposureMetrics | null;
  sectors: SectorRow[];
  positions: PositionRow[];
  values: MonitorValueMap;
  details?: Record<string, string | null>;
  degraded?: Record<string, string | null>;
  staleIds?: string[];
  fundVar?: { dollars: number | null; pct: number | null; observations: number } | null;
  feeds: DataFeed[];
  config: RiskConfig;
}): RiskModel {
  const stale = new Set(input.staleIds ?? []);

  const rows: MonitorRow[] = MONITORS.map((monitor) => {
    const value = input.values[monitor.id] ?? null;
    const isStale = stale.has(monitor.id);
    return {
      monitor,
      value,
      display: formatMonitorValue(monitor, value),
      limitText: describeLimit(monitor, input.config),
      // A stale card must never show a colour: a green board built on a dead
      // feed produces false confidence instead of none [§1 rule 2].
      status: isStale ? "na" : scoreMonitor(monitor, value, input.config),
      stale: isStale,
      degradedReason: input.degraded?.[monitor.id] ?? null,
      detail: input.details?.[monitor.id] ?? null,
    };
  });

  const monitors = MONITOR_GROUPS.map((g) => ({
    group: g.id,
    label: g.label,
    blurb: g.blurb,
    rows: rows.filter((r) => r.monitor.group === g.id),
  }));

  const counts: Record<RiskStatus, number> = { green: 0, yellow: 0, red: 0, na: 0 };
  for (const r of rows) counts[r.status] += 1;
  for (const row of input.positions) {
    for (const r of Object.values(row.rules)) counts[r.status] += 1;
  }

  const breaches: RiskModel["breaches"] = [];
  for (const r of rows) {
    if (r.status === "red") {
      breaches.push({
        monitorId: r.monitor.id,
        label: r.monitor.label,
        subject: null,
        display: r.display,
        limitText: r.limitText,
      });
    }
  }
  for (const row of input.positions) {
    for (const r of Object.values(row.rules)) {
      if (r.status !== "red") continue;
      breaches.push({
        monitorId: r.id,
        label: POSITION_RULES_BY_ID[r.id]?.label ?? r.id,
        subject: row.position.symbol,
        display: r.display,
        limitText: describePositionLimit(r.id, row, input.config),
      });
    }
  }

  return {
    asOf: input.asOf,
    hasLiveData: input.hasLiveData,
    nav: input.nav,
    navAsOf: input.navAsOf,
    exposure: input.exposure,
    sectors: input.sectors,
    monitors,
    positions: sortPositionRows(input.positions),
    counts,
    breaches,
    fundVar: input.fundVar ?? null,
    feeds: input.feeds,
    config: input.config,
  };
}

/** The limit text for a position-level red, for the alert log and emails. */
export function describePositionLimit(id: PositionRuleId, row: PositionRow, config: RiskConfig): string {
  const isLong = row.position.side === "long";
  switch (id) {
    case "long-size":
      return `≤ ${cfg(config, "long_cap") ?? "—"}% of NAV`;
    case "short-size":
      return `≤ ${cfg(config, "short_cap") ?? "—"}% of NAV`;
    case "pnl-vs-cost":
      return `stop at −${cfg(config, "stop_loss_pct") ?? "—"}% vs cost`;
    case "stop-order-present":
      return `resting GTC stop within ${cfg(config, "stop_order_tolerance_pct") ?? "—"}% of ${
        row.stop.expected != null ? `$${row.stop.expected.toFixed(2)}` : "the stop level"
      }`;
    case "stop-loss-status":
      return `${isLong ? "long" : "short"} stop executed at the broker`;
    case "position-var-share":
      return `≤ ${cfg(config, "position_var_share_cap") ?? "—"}% of total Fund VaR`;
    case "defined-risk-max-loss":
      return `defined-risk maximum of $${(row.position.approval?.defined_risk_max_loss ?? 0).toLocaleString("en-US")}`;
    default:
      return "—";
  }
}

/** Look up one monitor row by id. */
export function findMonitor(model: RiskModel, id: string): MonitorRow | undefined {
  for (const g of model.monitors) {
    const row = g.rows.find((r) => r.monitor.id === id);
    if (row) return row;
  }
  return undefined;
}
