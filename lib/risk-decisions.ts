/**
 * Where the dashboard and the published IPS text disagree.
 *
 * From §5 of the Wave 2 holding document: "The following are reflected in the
 * Wave 1 specification but are not yet stated in the published IPS text. Each
 * requires a Decision Log entry so that the specification and the IPS agree."
 *
 * This is Wave 1 hygiene rather than Wave 2 work — the metrics in that
 * document are explicitly gated on Wave 1 acceptance, but these entries are
 * about limits the board is *already enforcing* under authority the IPS text
 * does not yet carry. Anyone auditing the fund would find a dashboard turning
 * positions red against a 5% short cap that appears nowhere in the IPS, so the
 * gap is worth showing rather than leaving in a Word document.
 *
 * Ordered by how exposed the fund is while each stays open.
 */

export type DecisionState =
  /** Investment Committee approved it; only the IPS text amendment is outstanding. */
  | "approved"
  /** Approved in principle, but a number is still to be fixed. */
  | "in-principle"
  /** Nobody has decided. The dashboard cannot enforce it at all. */
  | "undecided";

export type DecisionEntry = {
  id: string;
  title: string;
  /** What the dashboard does today. */
  enforcing: string;
  /** What the published governing text says, or fails to say. */
  gap: string;
  state: DecisionState;
  /** Config keys this entry governs, so the two views can be cross-read. */
  keys?: string[];
  source: string;
};

export const DECISION_LOG: DecisionEntry[] = [
  {
    id: "margin-debit",
    title: "Zero tolerance on a margin debit balance",
    enforcing: "Any debit above zero is red and escalates to the Head of Operations immediately.",
    gap: "Not formally approved. The IPS says 'no leverage' but never mentions margin, and the escalation rests on IRC §514 acquisition-indebtedness grounds rather than on any written rule.",
    state: "undecided",
    keys: ["margin_debit_tolerance"],
    source: "IPS II.c; Risk Manager tax review",
  },
  {
    id: "allocation-bands",
    title: "Equities and Alternatives allocation bands",
    enforcing: "Nothing. The allocation monitor shows its value and declines to score it.",
    gap: "IPS VIII.a references upper and lower bands around the 75/25 split but never defines them, so the one monitor with a President-and-Faculty escalation chain cannot fire.",
    state: "undecided",
    keys: ["equities_band_low", "equities_band_high"],
    source: "IPS VIII.a",
  },
  {
    id: "vega-caps",
    title: "Net long vega cap, and a short vega limit alongside it",
    enforcing: "Vega is displayed and flagged only when net long. No numeric limit is applied.",
    gap: "No cap exists in the IPS. The Risk Manager's proposal is 0.10% of NAV per volatility point with a tighter short-side limit, pending the Alternatives team.",
    state: "undecided",
    keys: ["net_vega_cap"],
    source: "IPS III.b",
  },
  {
    id: "position-var-share",
    title: "Position VaR share replaces the 50% one-day VaR stop trigger",
    enforcing: "A position over 40% of total Fund VaR is red; 30% is yellow.",
    gap: "Approved in principle on 9/2/26, but the 40% threshold is the Risk Manager's proposal and the IPS amendment will fix the number.",
    state: "in-principle",
    keys: ["position_var_share_cap", "position_var_share_yellow"],
    source: "IPS III.d",
  },
  {
    id: "stop-loss-mechanism",
    title: "Automatic stop-loss, exempt from the exit vote",
    enforcing: "A resting GTC plain stop is required on every equity position, and a missing or mispriced one notifies immediately.",
    gap: "Approved 9/2/26. IPS IV.c step 4 requires a carve-out for automatic execution without an Investment Committee exit vote.",
    state: "approved",
    keys: ["stop_loss_pct", "stop_order_tolerance_pct"],
    source: "IPS III.d, IV.c",
  },
  {
    id: "short-cap",
    title: "Short position cap of 5% of NAV",
    enforcing: "A short over 5% of NAV is red and notifies the President and PM immediately.",
    gap: "Approved 9/2/26. The published IPS states only the 10% long cap.",
    state: "approved",
    keys: ["short_cap"],
    source: "IPS III.b",
  },
  {
    id: "sector-cap",
    title: "Sector concentration cap of 15% of NAV, Equities book",
    enforcing: "Any coverage sector over 15% of NAV in gross exposure is red at the close.",
    gap: "Approved 9/2/26. Also needs NAV defined once in the IPS, stating that 'total fund size' and 'AUM' mean the same quantity.",
    state: "approved",
    keys: ["sector_cap"],
    source: "IPS VI",
  },
  {
    id: "volatility-parameter",
    title: "The 12% figure is annualized volatility, and a ceiling",
    enforcing: "Annualized volatility over 12% is red; the 6% floor is display only.",
    gap: "Approved 9/2/26. The published IPS text reads 'variance', and does not say whether the figure is a target or a ceiling.",
    state: "approved",
    keys: ["volatility_cap"],
    source: "IPS II.c",
  },
  {
    id: "benchmark",
    title: "Benchmark set to the 3-month Treasury bill",
    enforcing: "Period return is compared against the 3-month T-bill, and Sharpe uses it as the risk-free rate.",
    gap: "Approved 9/2/26. The Governance Document says only 'relevant benchmarks and indices'.",
    state: "approved",
    source: "Gov. IV.a; IPS II.b",
  },
  {
    id: "cash-buffer",
    title: "Cash buffer sized to short-put assignment cost",
    enforcing: "Nothing. Cash available is shown against a 5% floor as an operating warning only.",
    gap: "Not in the IPS. Proposed as the structural defence against an accidental debit balance, and the assignment-cost calculation is itself Wave 2.",
    state: "undecided",
    keys: ["cash_floor_pct"],
    source: "Risk Manager proposal",
  },
  {
    id: "blackout-winddown",
    title: "End-of-spring derivative wind-down",
    enforcing: "Nothing. The trading calendar only detects trades inside the blackout after the fact.",
    gap: "Not in the IPS. Positions held across the summer blackout drift with no ability to act on them, which is precisely when nobody is watching.",
    state: "undecided",
    source: "Gov. VIII.c",
  },
  {
    id: "weekly-report",
    title: "The weekly report to the Equities PM",
    enforcing: "A weekly pack is built and exportable.",
    gap: "Risk Manager practice rather than a requirement — the shortest cadence the Governance Document actually mandates is monthly.",
    state: "approved",
    source: "Gov. IV.a",
  },
];

export const DECISION_STATE_LABEL: Record<DecisionState, string> = {
  approved: "Approved — IPS text pending",
  "in-principle": "Approved in principle — number pending",
  undecided: "Not decided",
};

/** Entries where the dashboard cannot enforce anything until someone decides. */
export function unenforceable(entries = DECISION_LOG): DecisionEntry[] {
  return entries.filter((e) => e.state === "undecided");
}
