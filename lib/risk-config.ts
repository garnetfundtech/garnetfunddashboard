/**
 * Garnet Fund — Risk configuration (Build Specification §7).
 *
 * The rule that overrides everything else in the spec: "Every limit value
 * lives in a single configuration table that the Risk Manager can edit
 * without a code change. Nothing in the IPS is hardcoded."
 *
 * So this file holds no thresholds of its own — it holds the *definitions*:
 * each parameter's initial value, the IPS or Governance clause it traces to,
 * and whether the Committee has actually settled it. Everything downstream
 * (the monitors, the position rules, the report packs) reads the resolved
 * config, never a literal.
 *
 * A parameter with `defaultValue: null` is genuinely undecided (§8 Open
 * items). Those must stay null rather than being given a plausible number:
 * a monitor with no limit displays its value and declines to score it, which
 * is honest. A guessed limit that turns red is worse than no limit at all,
 * because someone will act on it.
 */
import { createAdminClient } from "@/lib/supabase/admin";

/** Where the number came from, and how settled it is [§7 Status column]. */
export type ConfigStatus =
  /** Traces to published IPS/Governance text and the Committee has ratified it. */
  | "final"
  /** Committee approved it; the IPS text has not been reissued yet. */
  | "amendment-pending"
  /** The Risk Manager's proposal, approved in principle only. */
  | "proposed"
  /** Nobody has decided. Stays null until they do. */
  | "pending"
  /** Not an IPS limit — a Risk Manager operating preference or a yellow band. */
  | "operating";

export type ConfigDef = {
  key: ConfigKey;
  label: string;
  /** null means undecided — see the file header. */
  defaultValue: number | null;
  unit: "%" | "$" | "days" | "";
  source: string;
  status: ConfigStatus;
  /** Grouping for the §7 admin table. */
  section: "exposure" | "sizing" | "stops" | "allocation" | "liquidity" | "options" | "calendar" | "method";
  note?: string;
};

export type ConfigKey =
  // Exposure
  | "gross_cap"
  | "gross_yellow"
  | "net_min"
  | "net_max"
  | "net_yellow_low"
  | "net_yellow_high"
  | "volatility_cap"
  | "volatility_yellow"
  | "volatility_window_days"
  // Allocation
  | "equities_target"
  | "equities_band_low"
  | "equities_band_high"
  | "alternatives_target"
  | "alternatives_cap"
  | "alternatives_yellow"
  | "sector_cap"
  | "sector_yellow"
  | "allocation_band_warn_pts"
  // Sizing
  | "long_cap"
  | "long_yellow"
  | "short_cap"
  | "short_yellow"
  | "position_var_share_cap"
  | "position_var_share_yellow"
  // Stops
  | "stop_loss_pct"
  | "stop_warn_pct"
  | "stop_order_tolerance_pct"
  | "stop_applies_to_alternatives"
  // Liquidity / balance sheet
  | "margin_debit_tolerance"
  | "cash_floor_pct"
  | "disbursement_threshold"
  | "disbursement_max_pct"
  // Options
  | "option_expiry_window_days"
  | "net_vega_cap"
  // Method
  | "var_lookback_days"
  | "sharpe_min_observations"
  | "stale_hours";

/**
 * §7 Configuration table, verbatim initial values. Order here is display
 * order in the admin UI.
 */
export const CONFIG_DEFS: ConfigDef[] = [
  // ── Exposure ────────────────────────────────────────────────────────────
  {
    key: "gross_cap",
    label: "Gross exposure cap",
    defaultValue: 100,
    unit: "%",
    source: "IPS II.c",
    status: "final",
    section: "exposure",
    note: "Target 100% gross. No leverage; the fund does not operate outside invested capital. Compliant at exactly 100%, red strictly above.",
  },
  {
    key: "gross_yellow",
    label: "Gross exposure warning",
    defaultValue: 95,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "exposure",
    note: "Yellow band width. Not an IPS number — tighten once a few months of live data exist.",
  },
  {
    key: "net_min",
    label: "Net exposure floor",
    defaultValue: 20,
    unit: "%",
    source: "IPS II.c",
    status: "final",
    section: "exposure",
    note: "Band is inclusive: 20% is compliant, red strictly below.",
  },
  {
    key: "net_max",
    label: "Net exposure ceiling",
    defaultValue: 60,
    unit: "%",
    source: "IPS II.c",
    status: "final",
    section: "exposure",
    note: "Band is inclusive: 60% is compliant, red strictly above.",
  },
  {
    key: "net_yellow_low",
    label: "Net exposure warning (low)",
    defaultValue: 25,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "exposure",
  },
  {
    key: "net_yellow_high",
    label: "Net exposure warning (high)",
    defaultValue: 55,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "exposure",
  },
  {
    key: "volatility_cap",
    label: "Annualized volatility cap",
    defaultValue: 12,
    unit: "%",
    source: "IPS II.c",
    status: "amendment-pending",
    section: "exposure",
    note: "The published IPS text reads 'variance'; the Committee approved the amendment to volatility on 9/2/26.",
  },
  {
    key: "volatility_yellow",
    label: "Annualized volatility warning",
    defaultValue: 10,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "exposure",
  },
  {
    key: "volatility_window_days",
    label: "Volatility window",
    defaultValue: 60,
    unit: "days",
    source: "Risk Manager",
    status: "operating",
    section: "exposure",
    note: "Trailing trading days of realized fund returns. Roughly three months of stored NAV are needed before this is meaningful.",
  },

  // ── Allocation ──────────────────────────────────────────────────────────
  {
    key: "equities_target",
    label: "Equities allocation target",
    defaultValue: 75,
    unit: "%",
    source: "IPS II.a",
    status: "final",
    section: "allocation",
  },
  {
    key: "equities_band_low",
    label: "Equities band — lower",
    defaultValue: null,
    unit: "%",
    source: "IPS VIII.a",
    status: "pending",
    section: "allocation",
    note: "IPS VIII.a references upper and lower bands around the 75/25 split but does not define them. Until the Committee sets these, the Equities allocation monitor displays its value and does not score it.",
  },
  {
    key: "equities_band_high",
    label: "Equities band — upper",
    defaultValue: null,
    unit: "%",
    source: "IPS VIII.a",
    status: "pending",
    section: "allocation",
  },
  {
    key: "allocation_band_warn_pts",
    label: "Allocation band warning width",
    defaultValue: 5,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "allocation",
    note: "Percentage points inside a band edge at which the allocation monitor turns yellow [§4.1: 'Within 5 pts of band edge'].",
  },
  {
    key: "alternatives_target",
    label: "Alternatives allocation target",
    defaultValue: 25,
    unit: "%",
    source: "IPS II.a",
    status: "final",
    section: "allocation",
  },
  {
    key: "alternatives_cap",
    label: "Alternatives hard cap",
    defaultValue: 25,
    unit: "%",
    source: "IPS II.b",
    status: "final",
    section: "allocation",
    note: "Futures counted at beta-weighted dollar delta; commodity futures at raw notional and excluded from beta-weighting, but still inside the 25% [§8, conservative reading].",
  },
  {
    key: "alternatives_yellow",
    label: "Alternatives warning",
    defaultValue: 20,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "allocation",
  },
  {
    key: "sector_cap",
    label: "Sector concentration cap (Equities book)",
    defaultValue: 15,
    unit: "%",
    source: "Committee decision 9/2/26",
    status: "amendment-pending",
    section: "allocation",
    note: "Gross exposure per sector as a % of NAV, Equities-team positions only. 15% of NAV corresponds to 20% of the Equities allocation at its 75% target.",
  },
  {
    key: "sector_yellow",
    label: "Sector concentration warning",
    defaultValue: 12,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "allocation",
  },

  // ── Sizing ──────────────────────────────────────────────────────────────
  {
    key: "long_cap",
    label: "Single long position cap",
    defaultValue: 10,
    unit: "%",
    source: "IPS III.b, IV.c",
    status: "final",
    section: "sizing",
    note: "Compliant at exactly 10%, red strictly above, matching the IPS wording 'over 10%'. Where exceeded, exposure must be reduced below 10% immediately.",
  },
  {
    key: "long_yellow",
    label: "Single long warning",
    defaultValue: 8,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "sizing",
  },
  {
    key: "short_cap",
    label: "Single short position cap",
    defaultValue: 5,
    unit: "%",
    source: "Committee decision 9/2/26",
    status: "amendment-pending",
    section: "sizing",
    note: "Tighter than the long cap because of negative convexity: an adverse move on a short expands the exposure while a long self-limits.",
  },
  {
    key: "short_yellow",
    label: "Single short warning",
    defaultValue: 4,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "sizing",
  },
  {
    key: "position_var_share_cap",
    label: "Position VaR share limit",
    defaultValue: 40,
    unit: "%",
    source: "IPS III.d replacement",
    status: "proposed",
    section: "sizing",
    note: "Standalone position VaR ÷ total Fund VaR. Replaces the original 50% one-day VaR trigger, which could not fire on an equity position. Approved in principle 9/2/26; the IPS amendment will fix the number.",
  },
  {
    key: "position_var_share_yellow",
    label: "Position VaR share warning",
    defaultValue: 30,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "sizing",
  },

  // ── Stops ───────────────────────────────────────────────────────────────
  {
    key: "stop_loss_pct",
    label: "Automatic stop-loss",
    defaultValue: 30,
    unit: "%",
    source: "IPS III.d",
    status: "final",
    section: "stops",
    note: "Resting GTC plain stop at the broker, 30% below cost basis (30% above the short-sale price for shorts). Fires at a decline of 30% or more, so exactly −30% is red.",
  },
  {
    key: "stop_warn_pct",
    label: "Stop-loss warning",
    defaultValue: 20,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "stops",
    note: "The last point at which a decision can still be made. Past this the broker acts, not the Committee.",
  },
  {
    key: "stop_order_tolerance_pct",
    label: "Stop order tolerance",
    defaultValue: 1,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "stops",
    note: "A resting stop whose trigger sits more than this far from the −30% level counts as mispriced, and mispriced is red.",
  },
  {
    key: "stop_applies_to_alternatives",
    label: "Stop-order check covers Alternatives",
    defaultValue: 0,
    unit: "",
    source: "§8 Open item",
    status: "pending",
    section: "stops",
    note: "1 = on, 0 = off. The stop is confirmed for equity positions. Whether it applies unchanged to options — where a 30% move is routine and defined-risk positions already carry an accepted maximum loss — is pending discussion with the Alternatives team.",
  },

  // ── Liquidity / balance sheet ───────────────────────────────────────────
  {
    key: "margin_debit_tolerance",
    label: "Margin debit balance tolerance",
    defaultValue: 0,
    unit: "$",
    source: "IPS II.c; tax structure",
    status: "final",
    section: "liquidity",
    note: "Zero tolerance. Any debit is acquisition indebtedness under IRC §514 and a UBTI exposure, which is why this escalates to Operations rather than staying inside the risk function.",
  },
  {
    key: "cash_floor_pct",
    label: "Cash available to trade floor",
    defaultValue: 5,
    unit: "%",
    source: "Risk Manager",
    status: "operating",
    section: "liquidity",
    note: "Leading indicator for a debit balance. Display only — no red tier.",
  },
  {
    key: "disbursement_threshold",
    label: "Disbursement AUM threshold",
    defaultValue: 1_000_000,
    unit: "$",
    source: "Gov. VIII.c",
    status: "final",
    section: "liquidity",
    note: "The disbursement policy activates at this AUM and suspends if AUM falls back below it.",
  },
  {
    key: "disbursement_max_pct",
    label: "Maximum annual disbursement",
    defaultValue: 4,
    unit: "%",
    source: "Gov. VIII.c",
    status: "final",
    section: "liquidity",
  },

  // ── Options ─────────────────────────────────────────────────────────────
  {
    key: "option_expiry_window_days",
    label: "Long-premium option expiry approval window",
    defaultValue: 7,
    unit: "days",
    source: "IPS III.b",
    status: "final",
    section: "options",
    note: "A long-premium option expiring inside this window needs Risk Manager approval before execution.",
  },
  {
    key: "net_vega_cap",
    label: "Net long vega cap (Alternatives)",
    defaultValue: null,
    unit: "$",
    source: "IPS III.b",
    status: "pending",
    section: "options",
    note: "No numeric limit exists yet. The Risk Manager's proposal is 0.10% of NAV per volatility point with a separate, tighter short vega limit; pending discussion with the Alternatives team. Display and flag net long only.",
  },

  // ── Method ──────────────────────────────────────────────────────────────
  {
    key: "var_lookback_days",
    label: "VaR lookback",
    defaultValue: 250,
    unit: "days",
    source: "§6 Calculation conventions",
    status: "operating",
    section: "method",
    note: "Historical simulation, one-day, 95%, current weights. Where price history is shorter, use what exists and flag the observation count.",
  },
  {
    key: "sharpe_min_observations",
    label: "Sharpe minimum observations",
    defaultValue: 60,
    unit: "days",
    source: "§5.2",
    status: "operating",
    section: "method",
    note: "Sharpe is shown only once at least this many daily observations exist.",
  },
  {
    key: "stale_hours",
    label: "Data staleness threshold",
    defaultValue: 24,
    unit: "days",
    source: "§1 rule 2",
    status: "operating",
    section: "method",
    note: "Hours. Past this a card shows STALE in grey rather than a silently old number.",
  },
];

export const CONFIG_BY_KEY: Record<ConfigKey, ConfigDef> = Object.fromEntries(
  CONFIG_DEFS.map((d) => [d.key, d]),
) as Record<ConfigKey, ConfigDef>;

// ── Non-numeric configuration ─────────────────────────────────────────────

/**
 * The seven sectors IPS VI requires the equity groups to cover, plus the
 * catch-all every real GICS feed eventually needs. Stored as config because
 * the coverage list is a Committee decision, not a market fact.
 */
export const DEFAULT_COVERAGE_SECTORS = [
  "Industrials",
  "Technology",
  "Media",
  "Telecom",
  "Healthcare",
  "Financial Institutions",
  "Consumer",
] as const;

/**
 * Summer blackout [Gov. VIII.c]: no trading between the last day of Spring
 * and the first day of Fall. Entered per university calendar each year, so
 * there is deliberately no default — an unset blackout means the monitor
 * reports "not configured", never a false all-clear.
 */
export type BlackoutWindow = { start: string; end: string };

export type RiskConfig = {
  /** Every numeric parameter, resolved. null where genuinely undecided. */
  values: Record<ConfigKey, number | null>;
  coverageSectors: string[];
  blackout: BlackoutWindow | null;
  /** Config keys whose value came from the DB rather than the default.
   *  An array rather than a Set so the whole config can cross the server →
   *  client boundary with the risk model. */
  overridden: ConfigKey[];
};

/**
 * The config as it stands with no database at all: pure IPS defaults. Used as
 * the fallback wherever a config load fails, because degrading to the IPS's
 * own published numbers is always safe and degrading to nothing blanks the
 * dashboard.
 */
export function defaultRiskConfig(): RiskConfig {
  return {
    values: defaults(),
    coverageSectors: [...DEFAULT_COVERAGE_SECTORS],
    blackout: null,
    overridden: [],
  };
}

function defaults(): Record<ConfigKey, number | null> {
  return Object.fromEntries(CONFIG_DEFS.map((d) => [d.key, d.defaultValue])) as Record<
    ConfigKey,
    number | null
  >;
}

/**
 * The resolved configuration: code defaults with any DB overrides layered on.
 *
 * Falls back to pure defaults when the table is missing or the query fails.
 * Degrading to the IPS's own published numbers is always safe; degrading to
 * nothing would blank the dashboard.
 */
export async function getRiskConfig(): Promise<RiskConfig> {
  const values = defaults();
  const overridden: ConfigKey[] = [];
  let coverageSectors: string[] = [...DEFAULT_COVERAGE_SECTORS];
  let blackout: BlackoutWindow | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("risk_config").select("key, num_value, json_value");
    if (error || !data) return { values, coverageSectors, blackout, overridden };

    for (const row of data as { key: string; num_value: number | null; json_value: unknown }[]) {
      if (row.key === "coverage_sectors") {
        if (Array.isArray(row.json_value) && row.json_value.length) {
          coverageSectors = row.json_value.map(String);
        }
        continue;
      }
      if (row.key === "blackout") {
        const v = row.json_value as BlackoutWindow | null;
        if (v?.start && v?.end) blackout = { start: v.start, end: v.end };
        continue;
      }
      if (row.key in values) {
        // A row that exists with a null num_value is a deliberate "unset this
        // limit" — the §8 open items are meant to be settable back to null.
        values[row.key as ConfigKey] = row.num_value ?? null;
        overridden.push(row.key as ConfigKey);
      }
    }
  } catch {
    /* table not migrated yet — defaults are correct */
  }

  return { values, coverageSectors, blackout, overridden };
}

/** Convenience: the numeric value for a key, or null when undecided. */
export function cfg(config: RiskConfig, key: ConfigKey): number | null {
  return config.values[key];
}

/**
 * Applies one config edit and writes its audit row in the same call.
 *
 * `reason` is required by §7 ("every change must be logged with a timestamp
 * and a reason; this feeds the Decision Log"), so it is enforced here rather
 * than left to the caller — a limit that moved for no recorded reason is the
 * one that cannot be defended to the Advisory Board.
 */
export async function updateRiskConfig(params: {
  key: ConfigKey | "coverage_sectors" | "blackout";
  numValue?: number | null;
  jsonValue?: unknown;
  reason: string;
  changedBy: string;
}): Promise<void> {
  const { key, numValue, jsonValue, reason, changedBy } = params;
  if (!reason.trim()) throw new Error("A reason is required for every configuration change.");

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("risk_config")
    .select("num_value, json_value")
    .eq("key", key)
    .maybeSingle();

  const isJson = key === "coverage_sectors" || key === "blackout";
  const oldValue = isJson
    ? existing?.json_value == null
      ? null
      : JSON.stringify(existing.json_value)
    : existing?.num_value != null
      ? String(existing.num_value)
      : CONFIG_BY_KEY[key as ConfigKey]?.defaultValue != null
        ? String(CONFIG_BY_KEY[key as ConfigKey].defaultValue)
        : null;

  const { error } = await admin.from("risk_config").upsert(
    {
      key,
      num_value: isJson ? null : (numValue ?? null),
      json_value: isJson ? (jsonValue ?? null) : null,
      updated_by: changedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw error;

  await admin.from("risk_config_history").insert({
    key,
    old_value: oldValue,
    new_value: isJson ? JSON.stringify(jsonValue ?? null) : String(numValue ?? "unset"),
    reason: reason.trim(),
    changed_by: changedBy,
  });
}
