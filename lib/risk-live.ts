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
import {
  buildRiskModel,
  computeExposure,
  computeSectorBalance,
  type RiskModel,
  type RiskValueMap,
  type SidedPosition,
} from "@/lib/risk-engine";
import { buildSampleModel } from "@/lib/risk-sample";

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
 * Builds the live model, or null when there's no live book. Wrapped in
 * unstable_cache below so the whole model — analytics (~30 price-history
 * fetches), trade stats, turnover — is computed once per window and shared
 * across every user and tab switch, instead of recomputing on each /risk load.
 */
async function buildLiveRiskModel(): Promise<RiskModel | null> {
  const asOf = new Date().toISOString();

  const portfolio = await fetchPortfolioSummary();
  if (!portfolio || portfolio.positions.length === 0 || portfolio.liquidationValue <= 0) {
    return null;
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
    };

    return buildRiskModel({
      asOf,
      source: "live",
      hasLiveData: true,
      nav,
      exposure,
      sectorBalance,
      values,
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

const cachedLiveRiskModel = unstable_cache(buildLiveRiskModel, ["risk-model-v1"], {
  revalidate: 90,
  tags: ["schwab-risk"],
});

export async function getRiskModel(): Promise<RiskModel> {
  try {
    const live = await cachedLiveRiskModel();
    if (live) return live;
  } catch {
    /* fall through to the sample book */
  }
  return buildSampleModel(new Date().toISOString());
}
