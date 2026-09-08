/**
 * The fund's coverage teams — the same seven groups analysts pick from on the
 * application form, not the 11 GICS sectors. These double as the top-level
 * "folders" in the team file workspace — see /files.
 *
 * Distinct from the GICS sectors that arrive on market data (holdings, quotes,
 * risk limits); those stay untouched in lib/risk-engine.ts and are only mapped
 * onto a color here.
 */
export const COVERAGE_TEAMS = [
  "Consumer",
  "Industrials",
  "TMT",
  "FIG",
  "Healthcare",
  "Energy",
  "Derivatives",
] as const;

export type CoverageTeam = (typeof COVERAGE_TEAMS)[number];

export function isCoverageTeam(value: string): value is CoverageTeam {
  return (COVERAGE_TEAMS as readonly string[]).includes(value);
}

/**
 * Maps the GICS sectors this app used for coverage before the switch to the
 * seven application-form teams. Kept so a stored value written under the old
 * taxonomy still resolves — supabase/migrations/0024_coverage_teams.sql applies
 * the same mapping to the rows themselves.
 */
export const LEGACY_TEAM_ALIASES: Record<string, CoverageTeam> = {
  Technology: "TMT",
  "Communication Services": "TMT",
  "Financial Services": "FIG",
  "Real Estate": "FIG",
  "Consumer Cyclical": "Consumer",
  "Consumer Defensive": "Consumer",
  "Basic Materials": "Industrials",
  Utilities: "Energy",
};

/** The coverage team for a stored value, or null if it maps to neither taxonomy. */
export function toCoverageTeam(value: string | null | undefined): CoverageTeam | null {
  if (!value) return null;
  if (isCoverageTeam(value)) return value;
  return LEGACY_TEAM_ALIASES[value] ?? null;
}

/**
 * Chart/badge color per sector. Keyed by name because sector strings arrive
 * from several places: our own pickers always use the coverage teams above,
 * while live holdings and quotes come back from FMP/Schwab using GICS names.
 * Both sets are listed so a position doesn't change color depending on which
 * feed described it.
 *
 * Callers must supply their own fallback for an unknown sector — see
 * SECTOR_FALLBACK_COLOR.
 */
export const SECTOR_COLORS: Record<string, string> = {
  // Coverage teams.
  Consumer: "#c2610a",
  Industrials: "#5c5347",
  TMT: "#8e0604",
  FIG: "#1f5c9e",
  Healthcare: "#1a7a4c",
  Energy: "#6b4423",
  Derivatives: "#6b4a9e",
  // GICS names used by external market-data feeds.
  Technology: "#8e0604",
  "Financial Services": "#1f5c9e",
  "Consumer Cyclical": "#c2610a",
  "Consumer Defensive": "#a68b00",
  "Communication Services": "#0e7d8c",
  "Basic Materials": "#a85a7a",
  "Real Estate": "#6b4a9e",
  Utilities: "#5c6b1f",
  Financials: "#1f5c9e",
  Communication: "#0e7d8c",
  Materials: "#a85a7a",
};

/** Neutral gray for sectors missing from SECTOR_COLORS (including "Unknown"). */
export const SECTOR_FALLBACK_COLOR = "#8b8d86";
