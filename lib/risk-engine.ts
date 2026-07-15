/**
 * Garnet Fund — Risk Engine
 *
 * Pure functions that turn a live (or sample) long/short book into the metrics
 * behind the Risk Monitor: net / gross exposure, sector long-vs-short balance,
 * position sizing, effective bets, and a fully-evaluated RYG model. No I/O here
 * so it's testable and reusable on both the live page and the demo preview.
 */
import type { LivePosition } from "@/lib/types";
import {
  RISK_GROUPS,
  RISK_LIMITS,
  evaluateLimit,
  type RiskGroup,
  type RiskLimit,
  type RiskStatus,
  type RiskUnit,
} from "@/lib/risk-parameters";

export type PositionSide = "long" | "short";

/** A position with an explicit side. `side` falls back to the sign of market value. */
export type SidedPosition = LivePosition & { side?: PositionSide };

export function sideOf(p: SidedPosition): PositionSide {
  if (p.side) return p.side;
  if (p.marketValue < 0 || p.quantity < 0) return "short";
  return "long";
}

// ── Exposure ──────────────────────────────────────────────────────────────

export type LargestPosition = { ticker: string; name: string; weight: number };

export type ExposureMetrics = {
  nav: number;
  longMV: number; // $ (positive)
  shortMV: number; // $ (positive, absolute)
  grossPct: number;
  netPct: number;
  longPct: number;
  shortPct: number;
  longCount: number;
  shortCount: number;
  maxLongWeight: number; // % of NAV, positive
  maxShortWeight: number; // % of NAV, positive
  largestLong: LargestPosition | null;
  largestShort: LargestPosition | null;
  effectiveBetsLong: number | null;
  effectiveBetsShort: number | null;
  /** Most-negative unrealized P&L % among longs (worst drawdown from cost). */
  worstLongDrawdown: number | null;
  /** Most-negative unrealized P&L % among shorts (worst move against us). */
  worstShortDrawdown: number | null;
};

/** Inverse-Herfindahl "effective number of bets" from a set of book weights. */
function effectiveBets(weights: number[]): number | null {
  const total = weights.reduce((s, w) => s + Math.abs(w), 0);
  if (total <= 0) return null;
  const sumSq = weights.reduce((s, w) => s + (Math.abs(w) / total) ** 2, 0);
  if (sumSq <= 0) return null;
  return 1 / sumSq;
}

export function computeExposure(positions: SidedPosition[], nav: number): ExposureMetrics {
  const longs = positions.filter((p) => sideOf(p) === "long");
  const shorts = positions.filter((p) => sideOf(p) === "short");

  const longMV = longs.reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const shortMV = shorts.reduce((s, p) => s + Math.abs(p.marketValue), 0);

  const pct = (v: number) => (nav > 0 ? (v / nav) * 100 : 0);

  const weightOf = (p: SidedPosition) => (nav > 0 ? (Math.abs(p.marketValue) / nav) * 100 : 0);

  const largestOf = (book: SidedPosition[]): LargestPosition | null => {
    let best: LargestPosition | null = null;
    for (const p of book) {
      const w = weightOf(p);
      if (!best || w > best.weight) best = { ticker: p.ticker, name: p.name, weight: w };
    }
    return best;
  };

  const worstDrawdown = (book: SidedPosition[]): number | null => {
    let worst: number | null = null;
    for (const p of book) {
      const pnl = p.unrealizedPnlPct;
      if (pnl == null || !Number.isFinite(pnl)) continue;
      if (worst == null || pnl < worst) worst = pnl;
    }
    return worst;
  };

  return {
    nav,
    longMV,
    shortMV,
    grossPct: pct(longMV + shortMV),
    netPct: pct(longMV - shortMV),
    longPct: pct(longMV),
    shortPct: pct(shortMV),
    longCount: longs.length,
    shortCount: shorts.length,
    maxLongWeight: largestOf(longs)?.weight ?? 0,
    maxShortWeight: largestOf(shorts)?.weight ?? 0,
    largestLong: largestOf(longs),
    largestShort: largestOf(shorts),
    effectiveBetsLong: effectiveBets(longs.map(weightOf)),
    effectiveBetsShort: effectiveBets(shorts.map(weightOf)),
    worstLongDrawdown: worstDrawdown(longs),
    worstShortDrawdown: worstDrawdown(shorts),
  };
}

// ── Sector balance ──────────────────────────────────────────────────────────

export type SectorBalanceRow = {
  sector: string;
  longPct: number; // % of NAV
  shortPct: number; // % of NAV
  gapPct: number; // |long − short|
};

export function computeSectorBalance(positions: SidedPosition[], nav: number): SectorBalanceRow[] {
  const map = new Map<string, { long: number; short: number }>();
  for (const p of positions) {
    const sector = p.sector ?? "Unknown";
    const w = nav > 0 ? (Math.abs(p.marketValue) / nav) * 100 : 0;
    const entry = map.get(sector) ?? { long: 0, short: 0 };
    if (sideOf(p) === "long") entry.long += w;
    else entry.short += w;
    map.set(sector, entry);
  }
  return [...map.entries()]
    .map(([sector, { long, short }]) => ({
      sector,
      longPct: long,
      shortPct: short,
      gapPct: Math.abs(long - short),
    }))
    .sort((a, b) => b.gapPct - a.gapPct);
}

/** Widest sector long-vs-short gap, used to score the sector-balance limit. */
export function worstSectorGap(rows: SectorBalanceRow[]): number | null {
  return rows.length ? rows[0].gapPct : null;
}

// ── Value formatting ────────────────────────────────────────────────────────

export function formatValue(unit: RiskUnit, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "%":
      return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
    case "beta":
      return value.toFixed(2);
    case "ratio":
      return value.toFixed(2);
    case "x":
      return `${value.toFixed(2)}×`;
    case "count":
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    case "$":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    default:
      return String(value);
  }
}

// ── Model assembly ──────────────────────────────────────────────────────────

export type RiskValueMap = Partial<Record<string, number | null>>;

export type EvaluatedRow = {
  limit: RiskLimit;
  value: number | null;
  display: string;
  status: RiskStatus;
};

export type BookSummary = {
  side: PositionSide;
  count: number;
  grossPct: number;
  largest: LargestPosition | null;
  effectiveBets: number | null;
};

export type StressScenarioView = {
  key: string;
  label: string;
  description: string;
  pnlPct: number;
};

export type VarView = {
  var95: number | null;
  cvar95: number | null;
  longOnlyVar95: number | null;
  varRatio: number | null;
};

export type RiskModel = {
  asOf: string;
  source: "live" | "sample" | "mixed";
  hasLiveData: boolean;
  nav: number | null;
  exposure: ExposureMetrics | null;
  headline: { net: EvaluatedRow; gross: EvaluatedRow; beta: EvaluatedRow };
  longBook: BookSummary | null;
  shortBook: BookSummary | null;
  sectorBalance: SectorBalanceRow[];
  groups: { group: RiskGroup; label: string; blurb: string; rows: EvaluatedRow[] }[];
  breaches: EvaluatedRow[];
  counts: Record<RiskStatus, number>;
  stress: StressScenarioView[];
  worstStress: StressScenarioView | null;
  varView: VarView | null;
};

/** Look up an evaluated row by its limit id across all groups. */
export function findRow(model: RiskModel, id: string): EvaluatedRow | undefined {
  for (const g of model.groups) {
    const row = g.rows.find((r) => r.limit.id === id);
    if (row) return row;
  }
  return undefined;
}

function evaluateRow(limit: RiskLimit, value: number | null | undefined): EvaluatedRow {
  const v = value == null || !Number.isFinite(value as number) ? null : (value as number);
  return {
    limit,
    value: v,
    display: formatValue(limit.unit, v),
    status: evaluateLimit(limit, v),
  };
}

/** Map computed exposure/sector metrics onto their limit ids. */
export function valuesFromExposure(
  exposure: ExposureMetrics,
  sector: SectorBalanceRow[],
): RiskValueMap {
  return {
    "net-exposure": exposure.netPct,
    "gross-exposure": exposure.grossPct,
    "sector-balance": worstSectorGap(sector),
    "max-long-weight": exposure.maxLongWeight || null,
    "max-short-weight": exposure.maxShortWeight || null,
    "long-kill-trigger": exposure.worstLongDrawdown,
    "short-kill-trigger": exposure.worstShortDrawdown,
    "effective-bets-long": exposure.longCount ? exposure.effectiveBetsLong : null,
    "effective-bets-short": exposure.shortCount ? exposure.effectiveBetsShort : null,
  };
}

export type BuildModelInput = {
  asOf: string;
  source: "live" | "sample" | "mixed";
  hasLiveData: boolean;
  nav: number | null;
  exposure: ExposureMetrics | null;
  sectorBalance: SectorBalanceRow[];
  /** Values for limits not derived from positions (beta, sharpe, manual, etc.). */
  values: RiskValueMap;
  stress?: StressScenarioView[];
  worstStress?: StressScenarioView | null;
  varView?: VarView | null;
};

export function buildRiskModel(input: BuildModelInput): RiskModel {
  const merged: RiskValueMap = {
    ...(input.exposure ? valuesFromExposure(input.exposure, input.sectorBalance) : {}),
    ...input.values,
  };

  const rows = RISK_LIMITS.map((limit) => evaluateRow(limit, merged[limit.id]));
  const byId = new Map(rows.map((r) => [r.limit.id, r]));

  // Sortino carries a dynamic rule: flag if it drops below Sharpe.
  const sortino = byId.get("sortino");
  const sharpe = byId.get("sharpe");
  if (sortino?.value != null && sharpe?.value != null && sortino.value < sharpe.value) {
    if (sortino.status === "green") sortino.status = "yellow";
  }

  const groups = RISK_GROUPS.map((g) => ({
    group: g.id,
    label: g.label,
    blurb: g.blurb,
    rows: rows.filter((r) => r.limit.group === g.id),
  }));

  const counts: Record<RiskStatus, number> = { green: 0, yellow: 0, red: 0, na: 0 };
  for (const r of rows) counts[r.status] += 1;

  const breaches = rows.filter((r) => r.status === "red");

  const longBook: BookSummary | null = input.exposure
    ? {
        side: "long",
        count: input.exposure.longCount,
        grossPct: input.exposure.longPct,
        largest: input.exposure.largestLong,
        effectiveBets: input.exposure.effectiveBetsLong,
      }
    : null;

  const shortBook: BookSummary | null = input.exposure
    ? {
        side: "short",
        count: input.exposure.shortCount,
        grossPct: input.exposure.shortPct,
        largest: input.exposure.largestShort,
        effectiveBets: input.exposure.effectiveBetsShort,
      }
    : null;

  const fallback = (id: string): EvaluatedRow =>
    byId.get(id) ?? evaluateRow(RISK_LIMITS.find((l) => l.id === id)!, null);

  return {
    asOf: input.asOf,
    source: input.source,
    hasLiveData: input.hasLiveData,
    nav: input.nav,
    exposure: input.exposure,
    headline: {
      net: fallback("net-exposure"),
      gross: fallback("gross-exposure"),
      beta: fallback("net-beta"),
    },
    longBook,
    shortBook,
    sectorBalance: input.sectorBalance,
    groups,
    breaches,
    counts,
    stress: input.stress ?? [],
    worstStress: input.worstStress ?? null,
    varView: input.varView ?? null,
  };
}
