/**
 * Garnet Fund — Sample long/short book.
 *
 * A realistic, in-policy market-neutral portfolio used to (a) demonstrate the
 * full Risk Monitor for the board before the account holds live shorts, and
 * (b) render the page locally without Schwab/Supabase credentials. Everything
 * here is illustrative — the UI labels it "SAMPLE" wherever it appears.
 *
 * Deterministic: no randomness, so the demo looks identical every render.
 */
import {
  buildRiskModel,
  computeExposure,
  computeSectorBalance,
  type RiskModel,
  type RiskValueMap,
  type SidedPosition,
} from "@/lib/risk-engine";

export const SAMPLE_NAV = 1_250_000;

type Seed = { sector: string; longs: [string, string][]; shorts: [string, string][]; long: number; short: number };

// Sector targets keep long ≈ short within ±5% (Technology is deliberately a
// touch long-heavy to exercise a yellow on the sector-balance row).
const SEED: Seed[] = [
  {
    sector: "Technology",
    long: 15.5,
    short: 11,
    longs: [["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"], ["GOOGL", "Alphabet"]],
    shorts: [["INTC", "Intel"], ["HPQ", "HP"], ["DELL", "Dell"], ["WDC", "Western Digital"], ["STX", "Seagate"]],
  },
  {
    sector: "Healthcare",
    long: 10,
    short: 9,
    longs: [["LLY", "Eli Lilly"], ["UNH", "UnitedHealth"], ["ABBV", "AbbVie"]],
    shorts: [["PFE", "Pfizer"], ["BMY", "Bristol Myers"], ["VTRS", "Viatris"], ["ORGN", "Organon"]],
  },
  {
    sector: "Financials",
    long: 9,
    short: 10,
    longs: [["JPM", "JPMorgan"], ["GS", "Goldman Sachs"], ["V", "Visa"]],
    shorts: [["C", "Citigroup"], ["KEY", "KeyCorp"], ["ALLY", "Ally Financial"], ["SOFI", "SoFi"]],
  },
  {
    sector: "Consumer Cyclical",
    long: 8,
    short: 9,
    longs: [["AMZN", "Amazon"], ["HD", "Home Depot"]],
    shorts: [["GPS", "Gap"], ["KSS", "Kohl's"], ["M", "Macy's"], ["W", "Wayfair"]],
  },
  {
    sector: "Industrials",
    long: 7,
    short: 7,
    longs: [["CAT", "Caterpillar"], ["HON", "Honeywell"]],
    shorts: [["FDX", "FedEx"], ["DAL", "Delta"], ["UAL", "United Airlines"]],
  },
  {
    sector: "Energy",
    long: 5,
    short: 6,
    longs: [["XOM", "Exxon Mobil"], ["CVX", "Chevron"]],
    shorts: [["HAL", "Halliburton"], ["SLB", "Schlumberger"], ["OXY", "Occidental"]],
  },
  {
    sector: "Communication Services",
    long: 7,
    short: 6,
    longs: [["META", "Meta Platforms"], ["NFLX", "Netflix"]],
    shorts: [["WBD", "Warner Bros"], ["PARA", "Paramount"], ["LYV", "Live Nation"]],
  },
  {
    sector: "Consumer Defensive",
    long: 6,
    short: 6,
    longs: [["COST", "Costco"], ["PG", "Procter & Gamble"]],
    shorts: [["KHC", "Kraft Heinz"], ["CAG", "Conagra"], ["SJM", "J.M. Smucker"]],
  },
];

/** Split a book total into n weights with gentle decay, clamped to a cap. */
function split(total: number, n: number, cap: number): number[] {
  if (n <= 0) return [];
  const base = total / n;
  const mid = (n - 1) / 2;
  const tilt = 0.12;
  let w = Array.from({ length: n }, (_, i) => Math.min(cap, base * (1 + (tilt * (mid - i)) / (mid || 1))));
  const sum = w.reduce((s, x) => s + x, 0);
  if (sum > 0) {
    const scale = total / sum;
    if (scale <= 1) {
      w = w.map((x) => x * scale);
    } else {
      let remaining = total - sum;
      for (let i = 0; i < n && remaining > 0.001; i++) {
        const room = cap - w[i];
        const add = Math.min(room, remaining / (n - i));
        w[i] += add;
        remaining -= add;
      }
    }
  }
  return w.map((x) => Math.round(x * 100) / 100);
}

// Small, plausible P&L cycles per side; two deliberate extremes exercise the
// long / short kill-trigger rows.
const LONG_PNL = [-1.2, 3.4, -0.8, 2.1, 1.6, -2.4, 4.2];
const SHORT_PNL = [1.1, -2.3, 0.7, -1.5, 2.8, -0.9, 1.9];

function buildPositions(): SidedPosition[] {
  const out: SidedPosition[] = [];
  let li = 0;
  let si = 0;
  SEED.forEach((s) => {
    const longW = split(s.long, s.longs.length, 4.8);
    s.longs.forEach(([ticker, name], i) => {
      const weight = longW[i];
      const mv = (weight / 100) * SAMPLE_NAV;
      out.push(mkPosition(ticker, name, s.sector, "long", mv, weight, LONG_PNL[li % LONG_PNL.length]));
      li += 1;
    });
    const shortW = split(s.short, s.shorts.length, 3.0);
    s.shorts.forEach(([ticker, name], i) => {
      const weight = shortW[i];
      const mv = -(weight / 100) * SAMPLE_NAV;
      out.push(mkPosition(ticker, name, s.sector, "short", mv, weight, SHORT_PNL[si % SHORT_PNL.length]));
      si += 1;
    });
  });
  // Force one meaningful drawdown on each side so the kill-trigger rows read true.
  const worstLong = out.find((p) => p.ticker === "NVDA");
  if (worstLong) setPnl(worstLong, -12);
  const worstShort = out.find((p) => p.ticker === "SOFI");
  if (worstShort) setPnl(worstShort, -13);
  return out;
}

function mkPosition(
  ticker: string,
  name: string,
  sector: string,
  side: "long" | "short",
  marketValue: number,
  weight: number,
  pnlPct: number,
): SidedPosition {
  const abs = Math.abs(marketValue);
  const avgCost = 100; // illustrative — sizing/exposure don't depend on share price
  const quantity = (side === "long" ? 1 : -1) * (abs / avgCost);
  const unrealizedPnl = abs * (pnlPct / 100);
  return {
    ticker,
    name,
    assetType: "EQUITY",
    quantity,
    avgCost,
    currentPrice: avgCost * (1 + pnlPct / 100),
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct: pnlPct,
    dayPnl: 0,
    dayPnlPct: 0,
    weight: (marketValue / SAMPLE_NAV) * 100,
    sector,
    side,
  };
}

function setPnl(p: SidedPosition, pnlPct: number) {
  p.unrealizedPnlPct = pnlPct;
  p.currentPrice = p.avgCost * (1 + pnlPct / 100);
}

/** Metrics we can't derive from positions alone (beta, factors, VaR, perf, health). */
const SAMPLE_VALUES: RiskValueMap = {
  "net-beta": 0.06,
  "factor-size": 0.09,
  "factor-value": -0.13,
  "factor-momentum": 0.18, // watch
  "borrow-fee-gate": 2.4,
  "short-interest-gate": 11,
  "liquidity-exit": 2,
  "drawdown-from-high": -3.2,
  "var-95": 1.3,
  "cvar-95": 1.9,
  sharpe: 1.24,
  sortino: 1.62,
  "realized-vol": 6.4,
  "r2-spx": 0.07,
  "long-alpha": 3.1,
  "short-alpha": -0.8, // breach — short book lagging
  "hit-rate": 56,
  slugging: 1.35,
  calmar: 1.4,
  "borrow-drag": 0.6,
  turnover: 18,
  "avg-correlation-long": 0.32,
  "avg-correlation-short": 0.44, // watch
  "margin-buffer": 38,
};

// Illustrative stress scenarios for a roughly-neutral book: crash/melt-up are
// muted (shorts hedge longs); the concentrated short squeeze is the real tail.
const SAMPLE_STRESS = [
  { key: "crash", label: "−20% Market Crash", description: "Broad selloff, beta-weighted", pnlPct: -3.8 },
  { key: "meltup", label: "+15% Melt-Up", description: "Broad rally, beta-weighted", pnlPct: 2.4 },
  { key: "squeeze", label: "30% Short Squeeze", description: "Largest short (SOFI) +30%", pnlPct: -7.2 },
];

const SAMPLE_VAR = { var95: 1.3, cvar95: 1.9, longOnlyVar95: 2.9, varRatio: 1.3 / 2.9 };

export function buildSampleModel(asOf: string): RiskModel {
  const positions = buildPositions();
  const exposure = computeExposure(positions, SAMPLE_NAV);
  const sectorBalance = computeSectorBalance(positions, SAMPLE_NAV);
  const worst = SAMPLE_STRESS.reduce((w, s) => (s.pnlPct < w.pnlPct ? s : w));
  return buildRiskModel({
    asOf,
    source: "sample",
    hasLiveData: false,
    nav: SAMPLE_NAV,
    exposure,
    sectorBalance,
    values: {
      ...SAMPLE_VALUES,
      "stress-worst-loss": worst.pnlPct < 0 ? Math.abs(worst.pnlPct) : 0,
    },
    stress: SAMPLE_STRESS,
    worstStress: worst,
    varView: SAMPLE_VAR,
  });
}
