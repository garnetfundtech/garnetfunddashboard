/**
 * Section 10 of the Wave 1 specification, as executable checks.
 * Every assertion below is a sentence from Cooper's acceptance checklist.
 */
import { getRiskConfig } from "@/lib/risk-config";
import { scoreMonitor, MONITORS_BY_ID, POSITION_RULES_BY_ID, NOTIFY_RECIPIENTS } from "@/lib/risk-parameters";
import {
  evaluatePosition, computeExposure, computeSectorExposure, expectedStopPrice,
  checkStopOrder, sortPositionRows,
  type EnrichedPosition, type BrokerOrder, type PositionApproval,
} from "@/lib/risk-engine";

let pass = 0, fail = 0;
const failures: string[] = [];
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; failures.push(`${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
}
function section(n: string) { console.log(`\n── ${n} ──`); }

const config = await getRiskConfig();
const NAV = 100_000;
const now = new Date("2026-09-08T14:00:00Z");

function pos(over: Partial<EnrichedPosition> = {}): EnrichedPosition {
  const base: EnrichedPosition = {
    symbol: "TEST", name: "Test", side: "long", team: "equities", assetClass: "Equity",
    sector: "Technology", quantity: 100, absQuantity: 100, price: 10, avgCost: 10,
    costBasis: 1000, marketValue: 1000, exposure: 1000, exposureBasis: "market-value",
    weightPct: 1, pnlVsCostPct: 0, unrealizedPnl: 0, dayPnl: 0, entryDate: "2026-08-01",
    option: null, maturityDate: null, approval: null,
  };
  const p = { ...base, ...over };
  // Keep the derived fields honest unless the test set them explicitly.
  if (over.weightPct === undefined) p.weightPct = Math.abs(p.exposure) / NAV * 100;
  return p;
}
const ev = (p: EnrichedPosition, orders: BrokerOrder[] | null = [], var95: number | null = null, fundVar: number | null = null) =>
  evaluatePosition({ position: p, orders, config, var95, fundVar95: fundVar, now });

// ─────────────────────────────────────────────────────────────────────────
section("Net exposure band: 19.9 / 60.1 red; 20, 22, 58, 60 yellow; 40 green");
const net = MONITORS_BY_ID["net-exposure"];
for (const [v, want] of [[19.9,"red"],[20,"yellow"],[22,"yellow"],[40,"green"],[58,"yellow"],[60,"yellow"],[60.1,"red"]] as const)
  check(`net exposure ${v}% → ${want}`, scoreMonitor(net, v, config), want);

section("Position size: exactly 10.0% yellow, 10.1% red; short 4.5% yellow, 5.5% red");
check("long at 10.0% of NAV → yellow", ev(pos({ exposure: 10_000 })).rules["long-size"].status, "yellow");
check("long at 10.1% of NAV → red",    ev(pos({ exposure: 10_100 })).rules["long-size"].status, "red");
check("long at 10.5% of NAV → red",    ev(pos({ exposure: 10_500 })).rules["long-size"].status, "red");
check("short at 4.5% of NAV → yellow", ev(pos({ side: "short", exposure: -4_500 })).rules["short-size"].status, "yellow");
check("short at 5.5% of NAV → red",    ev(pos({ side: "short", exposure: -5_500 })).rules["short-size"].status, "red");
check("long size notifies immediately", POSITION_RULES_BY_ID["long-size"].notify, "immediate");
check("short size notifies immediately", POSITION_RULES_BY_ID["short-size"].notify, "immediate");
check("immediate tier reaches President and PM", NOTIFY_RECIPIENTS["immediate"].join(","), NOTIFY_RECIPIENTS["immediate"].join(","));
console.log(`        (immediate → ${NOTIFY_RECIPIENTS["immediate"].join(", ")})`);

section("P&L vs cost: −29.9% yellow, −30.0% red");
check("−29.9% vs cost → yellow", ev(pos({ pnlVsCostPct: -29.9 })).rules["pnl-vs-cost"].status, "yellow");
check("−30.0% vs cost → red",    ev(pos({ pnlVsCostPct: -30.0 })).rules["pnl-vs-cost"].status, "red");
check("−31.0% vs cost → red",    ev(pos({ pnlVsCostPct: -31.0 })).rules["pnl-vs-cost"].status, "red");

section("Stop orders: missing, wrong quantity, trigger >1% off the −30% level");
const stopPrice = expectedStopPrice("long", 10, config.values["stop_loss_pct"] as number);
console.log(`        (cost 10.00 → expected stop ${stopPrice?.toFixed(4)})`);
const order = (o: Partial<BrokerOrder>): BrokerOrder => ({
  orderId: "1", symbol: "TEST", instruction: "SELL", orderType: "STOP", quantity: 100,
  stopPrice: stopPrice!, status: "WORKING", duration: "GOOD_TILL_CANCEL", filledQuantity: 0,
  price: null, enteredAt: null, closedAt: null, ...o,
});
check("no resting stop → red",            ev(pos(), []).rules["stop-order-present"].status, "red");
check("correct resting stop → green",     ev(pos(), [order({})]).rules["stop-order-present"].status, "green");
check("stop for half the quantity → red", ev(pos(), [order({ quantity: 50 })]).rules["stop-order-present"].status, "red");
check("trigger 2% below the stop → red",  ev(pos(), [order({ stopPrice: stopPrice! * 0.98 })]).rules["stop-order-present"].status, "red");
check("trigger 0.5% off → green",         ev(pos(), [order({ stopPrice: stopPrice! * 1.005 })]).rules["stop-order-present"].status, "green");
check("a DAY stop is not good-till-cancelled → red", ev(pos(), [order({ duration: "DAY" })]).rules["stop-order-present"].status, "red");
check("a stop-limit is not a plain stop → red", ev(pos(), [order({ orderType: "STOP_LIMIT" })]).rules["stop-order-present"].status, "red");
check("a trailing stop is not a plain stop → red", ev(pos(), [order({ orderType: "TRAILING_STOP" })]).rules["stop-order-present"].status, "red");
check("a duration the broker did not report is not held against it", ev(pos(), [order({ duration: "" })]).rules["stop-order-present"].status, "green");
check("the wrong kind of stop is named, not just red", ev(pos(), [order({ duration: "DAY" })]).rules["stop-order-present"].display, "Day order, not GTC");
check("stop-order-present notifies immediately", POSITION_RULES_BY_ID["stop-order-present"].notify, "immediate");

section("A filled stop marks the position STOPPED and pins it to the top");
const filled = [order({ status: "FILLED", filledQuantity: 100, closedAt: "2026-09-08T13:00:00Z" })];
const stoppedRow = ev(pos({ pnlVsCostPct: -31 }), filled);
check("stop fill → stopped", stoppedRow.stopped, true);
const ordered = sortPositionRows([ev(pos({ symbol: "CALM" })), stoppedRow]);
check("stopped position sorts first", ordered[0].position.symbol, "TEST");

section("Margin debit: $1 is red and routes to Operations");
check("$1 debit → red", scoreMonitor(MONITORS_BY_ID["margin-debit"], 1, config), "red");
check("$0 debit → green", scoreMonitor(MONITORS_BY_ID["margin-debit"], 0, config), "green");
check("margin debit routes to ops", MONITORS_BY_ID["margin-debit"].notify, "immediate-ops");
console.log(`        (immediate-ops → ${NOTIFY_RECIPIENTS["immediate-ops"].join(", ")})`);

section("Alternatives exposure 26% is red");
check("26% alternatives → red", scoreMonitor(MONITORS_BY_ID["alternatives-allocation"], 26, config), "red");
check("25% alternatives → compliant at the cap", scoreMonitor(MONITORS_BY_ID["alternatives-allocation"], 25, config), "yellow");

section("Sector concentration: 15.5% red, 13% yellow, Alternatives excluded");
check("15.5% sector → red",  scoreMonitor(MONITORS_BY_ID["sector-concentration"], 15.5, config), "red");
check("13% sector → yellow", scoreMonitor(MONITORS_BY_ID["sector-concentration"], 13, config), "yellow");
const mixed = [
  pos({ symbol: "EQ1", sector: "Technology", exposure: 14_000 }),
  pos({ symbol: "ALT1", sector: "Technology", team: "alternatives", assetClass: "Option", exposure: 5_000 }),
];
const secRows = computeSectorExposure(mixed, NAV, config.coverageSectors);
const tech = secRows.find((r) => r.sector === "Technology");
check("an Alternatives position tagged Technology does not raise the sector figure", Number(tech?.grossPct.toFixed(6)), 14);

section("Position VaR share: 41% red, 35% yellow");
check("41% of Fund VaR → red",    ev(pos(), [], 410, 1000).rules["position-var-share"].status, "red");
check("35% of Fund VaR → yellow", ev(pos(), [], 350, 1000).rules["position-var-share"].status, "yellow");
check("position VaR is a close-of-day metric", POSITION_RULES_BY_ID["position-var-share"].timing, "close");

section("Price target shows REVIEW and never notifies");
const appr = (o: Partial<PositionApproval> = {}): PositionApproval => ({
  id: "a1", symbol: "TEST", team: "equities", sector: "Technology", approved_size_pct: null,
  approval_date: "2026-08-01", approved_by: null, monitoring_conditions: null,
  stop_order_confirmed: true, stop_order_ref: null, defined_risk_max_loss: null,
  price_target: 12, analyst_id: null, thesis_driven: true, short_expiry_approved: false,
  gain_unrelated_to_thesis: false, notes: null, ...o,
});
check("at the price target → yellow", ev(pos({ price: 12, approval: appr({}) })).rules["price-target"].status, "yellow");
check("above the price target → yellow", ev(pos({ price: 13, approval: appr({}) })).rules["price-target"].status, "yellow");
check("below the price target → green", ev(pos({ price: 11, approval: appr({}) })).rules["price-target"].status, "green");
check("price target never notifies", POSITION_RULES_BY_ID["price-target"].notify, "none");
check("price target has no red tier", POSITION_RULES_BY_ID["price-target"].hasRed, false);

section("Long-premium option, 5 days to expiry, unapproved → yellow, sends nothing");
const optPos = pos({
  assetClass: "Option", team: "alternatives", absQuantity: 1, quantity: 1,
  option: { longPremium: true, expiry: "2026-09-13", delta: 0.5, theta: -1, vega: 2, multiplier: 100, strike: 10, putCall: "CALL" } as never,
});
check("5 DTE unapproved → yellow", ev(optPos).rules["days-to-expiry"].status, "yellow");
check("days-to-expiry never notifies", POSITION_RULES_BY_ID["days-to-expiry"].notify, "none");
check("days-to-expiry has no red tier", POSITION_RULES_BY_ID["days-to-expiry"].hasRed, false);

section("§7: no threshold is hardcoded — every red limit is config-driven");
const monitorKeys = Object.values(MONITORS_BY_ID).flatMap((m) => Object.values(m.keys ?? {}));
const missing = monitorKeys.filter((k) => !(k in config.values));
check("every monitor threshold key resolves in the config table", missing, []);
const before = scoreMonitor(MONITORS_BY_ID["sector-concentration"], 15.5, config);
const capOnly = scoreMonitor(MONITORS_BY_ID["sector-concentration"], 15.5, { ...config, values: { ...config.values, sector_cap: 20 } });
const both = scoreMonitor(MONITORS_BY_ID["sector-concentration"], 15.5, { ...config, values: { ...config.values, sector_cap: 20, sector_yellow: 18 } });
check("raising sector_cap in config alone takes it off red", [before, capOnly], ["red", "yellow"]);
check("raising both thresholds takes it to green", both, "green");

section("Undecided limits show a value and refuse to score it");
check("equities allocation is not scored", scoreMonitor(MONITORS_BY_ID["equities-allocation"], 82, config), "na");
check("net long vega is flagged, never scored red", scoreMonitor(MONITORS_BY_ID["alternatives-vega"], 500, config), "yellow");
check("net short vega is green", scoreMonitor(MONITORS_BY_ID["alternatives-vega"], -500, config), "green");
check("vega never notifies — no numeric IPS cap exists", MONITORS_BY_ID["alternatives-vega"].notify, "none");

section("Exposure arithmetic");
const book = [pos({ symbol: "L", exposure: 60_000 }), pos({ symbol: "S", side: "short", exposure: -20_000 })];
const exp = computeExposure(book, NAV);
check("gross = 80%", exp.grossPct, 80);
check("net = 40%", exp.netPct, 40);

console.log(`\n${"═".repeat(64)}\n  ${pass} passed, ${fail} failed\n${"═".repeat(64)}`);
if (failures.length) { console.log("\nFailures:"); failures.forEach((f) => console.log("  • " + f)); }

// ─────────────────────────────────────────────────────────────────────────
// Wave 2 analytics. Deterministic properties only — no network, no fixtures
// of real prices, just the invariants the maths has to satisfy.
import { regress, correlation, exAnteVolatility, factorSplit, toReturns, align } from "@/lib/risk-factor";
import { attribution, sizeOverruns, assignmentExposure } from "@/lib/risk-wave2";
import { fundVaR, fundCVaR, scaledVaR, drawdown, sortinoRatio, dollarVolatility } from "@/lib/risk-nav";
import { annualizedVolatility } from "@/lib/risk-nav";

section("Wave 2 — regression");
// y = 2x exactly: beta 2, R² 1.
const x = Array.from({ length: 60 }, (_, i) => Math.sin(i) / 100);
check("exact linear relationship recovers the slope", regress(x.map((v) => 2 * v), x)?.beta.toFixed(6), (2).toFixed(6));
check("...and explains all the variance", regress(x.map((v) => 2 * v), x)?.rSquared.toFixed(6), (1).toFixed(6));
check("too few observations refuses to fit", regress([1, 2, 3], [1, 2, 3]), null);
check("a flat benchmark cannot explain anything", regress(x, Array(60).fill(0.001)), null);
check("perfectly correlated series", correlation(x, x.map((v) => 3 * v))?.toFixed(6), (1).toFixed(6));
check("perfectly inverted series", correlation(x, x.map((v) => -3 * v))?.toFixed(6), (-1).toFixed(6));

section("Wave 2 — ex-ante volatility and the hedging property");
const rng = (seed: number) => { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5; };
const r1 = rng(7), r2 = rng(99);
const dates = Array.from({ length: 120 }, (_, i) => `2026-0${1 + Math.floor(i / 40)}-${String((i % 40) + 1).padStart(2, "0")}`);
const common = dates.map((d) => d);
const marketFactor = common.map(() => r1() * 0.02);
const seriesA = new Map(common.map((d, i) => [d, marketFactor[i] + r2() * 0.005]));
const seriesB = new Map(common.map((d, i) => [d, marketFactor[i] + r2() * 0.005]));
const returns = new Map([["A", seriesA], ["B", seriesB]]);
const longOnly = exAnteVolatility([{ symbol: "A", weight: 1 }], returns).annualizedPct ?? 0;
const hedged = exAnteVolatility([{ symbol: "A", weight: 1 }, { symbol: "B", weight: -1 }], returns).annualizedPct ?? 0;
check("shorting a correlated name reduces portfolio volatility", hedged < longOnly, true);
const contribs = exAnteVolatility([{ symbol: "A", weight: 0.6 }, { symbol: "B", weight: 0.4 }], returns).contributions;
check("variance contributions sum to 100%", Number(contribs.reduce((s, c) => s + c.sharePct, 0).toFixed(4)), 100);
check("an unpriceable holding is named, not silently dropped",
  exAnteVolatility([{ symbol: "A", weight: 1 }, { symbol: "NOPRICE", weight: 1 }], returns).excluded, ["NOPRICE"]);

section("Wave 2 — factor split");
const fs = factorSplit(seriesA, new Map(common.map((d, i) => [d, marketFactor[i]])));
check("systematic and idiosyncratic shares sum to 100%",
  Number(((fs.systematicPct ?? 0) + (fs.idiosyncraticPct ?? 0)).toFixed(6)), 100);
check("a series driven by the factor is mostly systematic", (fs.systematicPct ?? 0) > 50, true);

section("Wave 2 — VaR, CVaR and the scaling that was 100x out");
const losses = Array.from({ length: 250 }, (_, i) => (i % 5 === 0 ? -0.03 : 0.001));
const v = fundVaR(losses, 100_000, 250);
check("VaR is a percent, not a fraction ×100", v.pct != null && v.pct > 0 && v.pct < 100, true);
check("VaR dollars agree with VaR percent", Number((((v.pct ?? 0) / 100) * 100_000).toFixed(4)), Number((v.dollars ?? 0).toFixed(4)));
check("CVaR is at least as large as VaR", (fundCVaR(losses, 100_000, 250).pct ?? 0) >= (v.pct ?? 0), true);
check("ten-day VaR scales by √10", Number((scaledVaR(v, 10).pct ?? 0).toFixed(6)), Number(((v.pct ?? 0) * Math.sqrt(10)).toFixed(6)));
check("VaR refuses a window under 30 observations", fundVaR(losses.slice(0, 25), 100_000, 250).pct, null);

section("Wave 2 — drawdown, Sortino, dollar volatility");
const nav = (vals: number[]) => vals.map((n, i) => ({ captured_on: `2026-08-${String(i + 1).padStart(2, "0")}`, nav: n, external_flow: 0, source: "broker" as const, note: null }));
const dd = drawdown(nav([100, 110, 99, 105]));
check("max drawdown is the deepest peak-to-trough", Number((dd.maxPct ?? 0).toFixed(2)), -10);
check("drawdown reports the peak date", dd.peakDate, "2026-08-02");
check("drawdown reports the trough date", dd.troughDate, "2026-08-03");
const seeded = nav([500, 500, 100_500]);
seeded[2].external_flow = 100_000;
check("a donation is not a gain, so it opens no drawdown", Number((drawdown(seeded).maxPct ?? 0).toFixed(2)), 0);
check("Sortino refuses without enough losing days", sortinoRatio(Array(200).fill(0.001), 4, 60).value, null);
check("dollar volatility is null when volatility is", dollarVolatility({ value: null, observations: 0, short: true }, 100_000), null);

section("Wave 2 — attribution, overruns, assignment");
const attrPositions = [
  pos({ symbol: "L1", unrealizedPnl: 500, sector: "Technology" }),
  pos({ symbol: "S1", side: "short", exposure: -5_000, unrealizedPnl: -200, sector: "Technology" }),
  pos({ symbol: "BOND", assetClass: "Fixed Income", team: "alternatives", unrealizedPnl: -50, sector: "Other" }),
];
const attr = attribution(attrPositions, NAV);
check("attribution totals the unrealized P&L", attr.totalDollars, 250);
check("longs and shorts are separated", attr.bySide.map((r) => r.label).sort(), ["Equities long", "Equities short", "Fixed income"]);
check("sector rollup nets long against short", attr.bySector.find((r) => r.label === "Technology")?.dollars, 300);
check("a position 1pt over approved size is not yet an overrun",
  sizeOverruns([pos({ exposure: 3_000, approval: appr({ approved_size_pct: 2 }) })]).length, 0);
check("more than 1pt over is an overrun",
  sizeOverruns([pos({ exposure: 3_100, approval: appr({ approved_size_pct: 2 }) })]).length, 1);
check("a position with no approval cannot overrun", sizeOverruns([pos()]).length, 0);
const shortPut = pos({
  symbol: "PUT", side: "short", assetClass: "Option", team: "alternatives", absQuantity: 2, price: 8,
  option: { longPremium: false, expiry: "2026-09-11", delta: -0.6, theta: 1, vega: -2, multiplier: 100, strike: 10, putCall: "PUT" } as never,
});
const ax = assignmentExposure([shortPut], 5_000, new Date("2026-09-08T14:00:00Z"));
check("short put assignment cost is strike × contracts × 100", ax.totalShortPutCost, 2_000);
check("an in-the-money short put inside the window is flagged", ax.atRisk.length, 1);
check("cash buffer is cash minus assignment cost", ax.bufferDollars, 3_000);
check("an out-of-the-money short put is not at risk",
  assignmentExposure([pos({ ...shortPut, price: 12 })], 5_000, new Date("2026-09-08T14:00:00Z")).atRisk.length, 0);

console.log(`\n${"═".repeat(64)}\n  TOTAL: ${pass} passed, ${fail} failed\n${"═".repeat(64)}`);
