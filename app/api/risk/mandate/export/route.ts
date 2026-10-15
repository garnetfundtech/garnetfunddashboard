import { requireApprovedProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { csvResponse } from "@/lib/csv";
import { canReadFullRiskBoard } from "@/lib/nav-access";
import { CONFIG_BY_KEY, getRiskConfig, type ConfigKey } from "@/lib/risk-config";
import { fetchTreasuryRate } from "@/lib/fmp";

export const dynamic = "force-dynamic";

/** The intended mix, in the order a reader would ask about it. */
const MIX_KEYS: ConfigKey[] = [
  "equities_target",
  "equities_band_low",
  "equities_band_high",
  "alternatives_target",
  "alternatives_cap",
  "sector_cap",
  "cash_floor_pct",
];

/**
 * The fund's benchmark and intended asset mix, as one small table.
 *
 * Targets come from the live risk config, so a limit the Committee has moved
 * shows its current value, and one still undecided says so rather than
 * printing a number nobody set. Where the latest nightly snapshot has the
 * actual figure, it sits beside the target.
 */
export async function GET() {
  const profile = await requireApprovedProfile();
  if (!canReadFullRiskBoard(profile.role)) {
    return new Response("Not available to your role.", { status: 403 });
  }

  const admin = createAdminClient();
  const [config, tbill, { data: latest }] = await Promise.all([
    getRiskConfig(),
    fetchTreasuryRate().catch(() => null),
    admin
      .from("risk_snapshots")
      .select("captured_on, equities_pct, alternatives_pct, cash_pct")
      .order("captured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const snap = latest as {
    captured_on: string;
    equities_pct: number | null;
    alternatives_pct: number | null;
    cash_pct: number | null;
  } | null;
  const actual: Partial<Record<ConfigKey, number | null>> = {
    equities_target: snap?.equities_pct ?? null,
    alternatives_target: snap?.alternatives_pct ?? null,
    cash_floor_pct: snap?.cash_pct ?? null,
  };
  const asOf = snap ? `Actual as of ${snap.captured_on}` : "";
  const num = (v: number | null | undefined) => (v == null ? "" : Number(Number(v).toFixed(2)));

  const header = ["Item", "Target / limit", "Unit", "Actual", "Status", "Source", "Note"];
  const body: unknown[][] = [
    [
      "Benchmark: 3-month U.S. Treasury bill",
      num(tbill?.month3),
      "% yield",
      "",
      "final",
      "Risk spec §5.1, §5.2",
      tbill
        ? "Current annualized yield. Period benchmark returns compound this daily over the same trading days as the fund's return."
        : "Yield unavailable from the market-data feed right now.",
    ],
    ...MIX_KEYS.map((key) => {
      const def = CONFIG_BY_KEY[key];
      const value = config.values[key];
      return [
        def.label,
        num(value),
        def.unit,
        key in actual ? num(actual[key]) : "",
        value == null ? "pending" : def.status,
        def.source,
        [key in actual && asOf ? asOf : "", def.note ?? ""].filter(Boolean).join(" "),
      ];
    }),
  ];

  return csvResponse(header, body, "garnet-fund-benchmark-and-mix");
}
