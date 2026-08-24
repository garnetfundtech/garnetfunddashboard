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
  Technology: "#8e0604",
  Healthcare: "#1a7a4c",
  "Financial Services": "#1f5c9e",
  "Consumer Cyclical": "#c2610a",
  "Consumer Defensive": "#a68b00",
  Industrials: "#5c5347",
  "Communication Services": "#0e7d8c",
  Energy: "#6b4423",
  "Basic Materials": "#a85a7a",
  "Real Estate": "#6b4a9e",
  Utilities: "#5c6b1f",
  // Aliases used by external market-data feeds.
  Financials: "#1f5c9e",
  Communication: "#0e7d8c",
  Materials: "#a85a7a",
};

/** Neutral gray for sectors missing from SECTOR_COLORS (including "Unknown"). */
export const SECTOR_FALLBACK_COLOR = "#8b8d86";
