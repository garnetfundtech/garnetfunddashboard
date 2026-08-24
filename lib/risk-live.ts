/**
 * Server-only bridge: turn live Schwab data into a full Phase 2 RiskModel,
 * falling back to the labeled sample book when the account is empty or
 * credentials are absent.
 *
 * Live now: exposure, sector balance, sizing, effective bets, net beta, Sharpe,
 * Sortino, realized vol, VaR/CVaR, R², drawdown/Calmar, size/value/momentum
 * loadings, per-side alpha, within-book correlations, stress scenarios
 * (analytics engine); hit-rate/slugging (realized gains); turnover (orders).
 * Still manual: borrow fee, short interest, borrow drag, liquidity, margin.
 */
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchAccountOrders,
  fetchPortfolioSummary,
  loadValidTraderToken,
} from "@/lib/market-data";
import { enrichPositionsWithSectors } from "@/lib/compute-portfolio-risk-stats";
import { computeRiskAnalytics } from "@/lib/risk-analytics";
import { getEffectiveLimits } from "@/lib/risk-thresholds";
import { RISK_LIMITS } from "@/lib/risk-parameters";
import {
  buildRiskModel,
  computeExposure,
  computeSectorBalance,
  type RiskModel,
  type RiskValueMap,
  sideOf,
  type SidedPosition,
} from "@/lib/risk-engine";

async function computeTradeStats(): Promise<{ hitRate: number | null; slugging: number | null }> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("realized_gains").select("gain_loss");
    const gains = (data ?? []).map((r) => Number(r.gain_loss ?? 0)).filter((g) => Number.isFinite(g));
    if (gains.length < 3) return { hitRate: null, slugging: null };
    const wins = gains.filter((g) => g > 0);
    const losses = gains.filter((g) => g < 0);
    const hitRate = (wins.length / gains.length) * 100;
    const avgWin = wins.length ? wins.reduce((s, g) => s + g, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, g) => s + g, 0) / losses.length) : 0;
    const slugging = avgLoss > 0 ? avgWin / avgLoss : null;
    return { hitRate, slugging };
  } catch {
    return { hitRate: null, slugging: null };
  }
}

async function computeTurnover(grossDollars: number): Promise<number | null> {
  if (grossDollars <= 0) return null;
  try {
    const orders = await fetchAccountOrders(30);
    if (!Array.isArray(orders)) return null;
    let traded = 0;
    for (const order of orders as Record<string, unknown>[]) {
      if (order.status !== "FILLED") continue;
      const activities = (order.orderActivityCollection as Record<string, unknown>[] | undefined) ?? [];
      for (const act of activities) {
        const legs = (act.executionLegs as Record<string, unknown>[] | undefined) ?? [];
        for (const leg of legs) traded += Number(leg.quantity ?? 0) * Number(leg.price ?? 0);
      }
    }
    return (traded / grossDollars) * 100;
  } catch {
    return null;
  }
}

/**
 * Builds the live model. Wrapped in unstable_cache below so the whole model —
 * analytics (~30 price-history fetches), trade stats, turnover — is computed
 * once per window and shared across every user and tab switch, instead of
 * recomputing on each /risk load.
 *
 * This ALWAYS returns the real account state — an empty or cash-only book
 * renders as a live book with no positions, never as the sample. The sample
 * model exists only for the /risk-preview demo page.
 */
async function buildLiveRiskModel(): Promise<RiskModel> {
  const asOf = new Date().toISOString();
  const limits = await getEffectiveLimits();

  const portfolio = await fetchPortfolioSummary();
  if (!portfolio) {
    // Schwab unreachable / token invalid: an honest empty model, not the sample.
    return buildRiskModel({
      asOf,
      source: "live",
      hasLiveData: false,
      nav: null,
      exposure: null,
      sectorBalance: [],
      values: {},
      stress: [],
      worstStress: null,
      varView: null,
      limits,
    });
  }

  const token = await loadValidTraderToken();
  const nav = portfolio.liquidationValue;

  let positions = portfolio.positions as SidedPosition[];
  const enriched = await enrichPositionsWithSectors(portfolio.positions).catch(() => null);
  if (enriched) positions = enriched as SidedPosition[];

    const [analytics, tradeStats, turnover] = await Promise.all([
      token
        ? computeRiskAnalytics(token, positions, nav).catch(() => null)
        : Promise.resolve(null),
      computeTradeStats(),
      computeTurnover(portfolio.grossMarketValue),
    ]);

    const exposure = computeExposure(positions, nav);
    const sectorBalance = computeSectorBalance(positions, nav);

    const worstStressLoss =
      analytics?.stress.worst && analytics.stress.worst.pnlPct < 0
        ? Math.abs(analytics.stress.worst.pnlPct)
        : analytics?.stress.worst
          ? 0
          : null;

    const values: RiskValueMap = {
      "net-beta": analytics?.netBeta ?? null,
      "realized-vol": analytics?.realizedVol ?? null,
      sharpe: analytics?.sharpe ?? null,
      sortino: analytics?.sortino ?? null,
      "var-95": analytics?.var95 ?? null,
      "cvar-95": analytics?.cvar95 ?? null,
      "r2-spx": analytics?.r2 ?? null,
      "drawdown-from-high": analytics?.drawdownFromHigh ?? null,
      calmar: analytics?.calmar ?? null,
      "factor-size": analytics?.factorSize ?? null,
      "factor-value": analytics?.factorValue ?? null,
      "factor-momentum": analytics?.factorMomentum ?? null,
      "long-alpha": analytics?.longAlpha ?? null,
      "short-alpha": analytics?.shortAlpha ?? null,
      "avg-correlation-long": analytics?.avgCorrLong ?? null,
      "avg-correlation-short": analytics?.avgCorrShort ?? null,
      "stress-worst-loss": worstStressLoss,
      "hit-rate": tradeStats.hitRate,
      slugging: tradeStats.slugging,
      turnover,
      // Proxy for per-price staleness: hours since the whole book was last
      // confirmed live against Schwab. No per-ticker price timestamp is
      // stored today, so this is the closest available signal — good enough
      // to catch "the feed died overnight," which is the failure item 10
      // exists to catch.
      "stale-data": (Date.now() - new Date(portfolio.verifiedAt).getTime()) / 3600000,
    };

    return buildRiskModel({
      asOf,
      source: "live",
      hasLiveData: true,
      nav,
      exposure,
      sectorBalance,
      values,
      limits,
      stress: analytics?.stress.scenarios ?? [],
      worstStress: analytics?.stress.worst ?? null,
      varView: analytics
        ? {
            var95: analytics.var95,
            cvar95: analytics.cvar95,
            longOnlyVar95: analytics.longOnlyVar95,
            varRatio: analytics.varRatio,
          }
        : null,
    });
}

const cachedLiveRiskModel = unstable_cache(buildLiveRiskModel, ["risk-model-v2"], {
  revalidate: 90,
  tags: ["schwab-risk"],
});

/** The live risk model — never the sample (that's /risk-preview only). */
export async function getRiskModel(): Promise<RiskModel> {
  try {
    return await cachedLiveRiskModel();
  } catch {
    // Even a hard failure renders as an honest empty live state.
    return buildRiskModel({
      asOf: new Date().toISOString(),
      source: "live",
      hasLiveData: false,
      nav: null,
      exposure: null,
      sectorBalance: [],
      values: {},
      stress: [],
      worstStress: null,
      varView: null,
      limits: RISK_LIMITS,
    });
  }
}

// ── Daily book snapshot ───────────────────────────────────────────────────

/** One position as persisted in `risk_snapshots.positions`. */
export type SnapshotPosition = {
  ticker: string;
  side: "long" | "short";
  /** Signed share count. The field drift-vs-trade classification compares. */
  quantity: number;
  avgCost: number;
  price: number;
  marketValue: number;
  /** Absolute weight as a % of NAV, so shorts are positive. */
  weight: number;
  sector: string | null;
};

export type SnapshotBook = {
  nav: number;
  longMV: number;
  shortMV: number;
  positions: SnapshotPosition[];
};

/**
 * The day's book, position by position, for the daily snapshot.
 *
 * Deliberately separate from `getRiskModel()`: the model is sent to every
 * browser that loads /risk, and the full position list has no business
 * inflating that payload. This runs server-side in the snapshot cron only.
 *
 * Returns null when there's no live account to snapshot — the caller should
 * skip the write rather than persist an empty book, which would read as
 * "we held nothing that day".
 */
export async function getSnapshotBook(): Promise<SnapshotBook | null> {
  const portfolio = await fetchPortfolioSummary();
  if (!portfolio || !portfolio.liquidationValue) return null;

  const nav = portfolio.liquidationValue;
  let positions = portfolio.positions as SidedPosition[];
  const enriched = await enrichPositionsWithSectors(portfolio.positions).catch(() => null);
  if (enriched) positions = enriched as SidedPosition[];

  const rows: SnapshotPosition[] = positions.map((p) => ({
    ticker: p.ticker,
    side: sideOf(p),
    quantity: p.quantity,
    avgCost: p.avgCost,
    price: p.currentPrice,
    marketValue: p.marketValue,
    weight: nav > 0 ? (Math.abs(p.marketValue) / nav) * 100 : 0,
    sector: p.sector ?? null,
  }));

  const longMV = rows.filter((r) => r.side === "long").reduce((s, r) => s + Math.abs(r.marketValue), 0);
  const shortMV = rows.filter((r) => r.side === "short").reduce((s, r) => s + Math.abs(r.marketValue), 0);

  return { nav, longMV, shortMV, positions: rows };
}
