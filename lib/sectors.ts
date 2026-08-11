/**
 * The 11 GICS sectors used as coverage-team names. These double as the
 * top-level "folders" in the team file workspace — see /files.
 */
export const GICS_SECTORS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Industrials",
  "Communication Services",
  "Energy",
  "Basic Materials",
  "Real Estate",
  "Utilities",
] as const;

export type GicsSector = (typeof GICS_SECTORS)[number];

export function isGicsSector(value: string): value is GicsSector {
  return (GICS_SECTORS as readonly string[]).includes(value);
}

/**
 * Chart/badge color per sector. Keyed by name because sector strings arrive
 * from several places: our own pickers always use the canonical GICS names
 * above, while live holdings and quotes come back from FMP/Schwab using shorter
 * labels. The aliases below map those onto the same color so a position doesn't
 * change color depending on which feed described it.
 *
 * Callers must supply their own fallback for an unknown sector — see
 * SECTOR_FALLBACK_COLOR.
 */
export const SECTOR_COLORS: Record<string, string> = {
  Technology: "#a78bfa",
  Healthcare: "#34d399",
  "Financial Services": "#60a5fa",
  "Consumer Cyclical": "#fbbf24",
  "Consumer Defensive": "#fb923c",
  Industrials: "#fb7185",
  "Communication Services": "#22d3ee",
  Energy: "#facc15",
  "Basic Materials": "#94a3b8",
  "Real Estate": "#f472b6",
  Utilities: "#a3e635",
  // Aliases used by external market-data feeds.
  Financials: "#60a5fa",
  Communication: "#22d3ee",
  Materials: "#94a3b8",
};

/** Neutral gray for sectors missing from SECTOR_COLORS (including "Unknown"). */
export const SECTOR_FALLBACK_COLOR = "#94a3b8";
