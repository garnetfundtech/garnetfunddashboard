/**
 * Stress-test engine (pure). Applies the fund's standing scenarios to the
 * current book: −20% crash, +15% melt-up (both beta-weighted per position), and
 * a 30% squeeze on the largest short. Output is P&L as a percent of NAV; any
 * scenario worse than −10% NAV is the covenant-style breach the notes call out.
 */
import { sideOf, type SidedPosition } from "@/lib/risk-engine";

export type StressScenario = {
  key: string;
  label: string;
  description: string;
  /** P&L as a percent of NAV (negative = loss). */
  pnlPct: number;
};

export type StressResult = {
  scenarios: StressScenario[];
  worst: StressScenario | null;
};

const DEFAULT_BETA = 1;

export function runStressTests(
  positions: SidedPosition[],
  nav: number,
  perPositionBeta: Record<string, number>,
): StressResult {
  if (nav <= 0 || !positions.length) return { scenarios: [], worst: null };

  const betaOf = (ticker: string) => {
    const b = perPositionBeta[ticker.toUpperCase()];
    return b != null && Number.isFinite(b) ? b : DEFAULT_BETA;
  };

  // Beta-driven broad shock: each position moves by beta × shock. Shorts carry a
  // negative market value, so a crash is a gain on the short book automatically.
  const marketShock = (shock: number) => {
    let pnl = 0;
    for (const p of positions) pnl += p.marketValue * betaOf(p.ticker) * shock;
    return (pnl / nav) * 100;
  };

  const shorts = positions.filter((p) => sideOf(p) === "short");
  let squeezePnl = 0;
  let squeezeName = "";
  if (shorts.length) {
    const largest = shorts.reduce((a, b) =>
      Math.abs(b.marketValue) > Math.abs(a.marketValue) ? b : a,
    );
    squeezeName = largest.ticker;
    // The name rises 30%; a short loses when it rises (marketValue is negative).
    squeezePnl = ((largest.marketValue * 0.3) / nav) * 100;
  }

  const scenarios: StressScenario[] = [
    { key: "crash", label: "−20% Market Crash", description: "Broad selloff, beta-weighted", pnlPct: marketShock(-0.2) },
    { key: "meltup", label: "+15% Melt-Up", description: "Broad rally, beta-weighted", pnlPct: marketShock(0.15) },
    {
      key: "squeeze",
      label: "30% Short Squeeze",
      description: squeezeName ? `Largest short (${squeezeName}) +30%` : "Largest short +30%",
      pnlPct: squeezePnl,
    },
  ];

  const worst = scenarios.reduce<StressScenario | null>(
    (w, s) => (w == null || s.pnlPct < w.pnlPct ? s : w),
    null,
  );

  return { scenarios, worst };
}
