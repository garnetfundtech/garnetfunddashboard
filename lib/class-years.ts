/**
 * Class standing shown on the member roster. Ordered by seniority so the
 * dropdowns read the way the roster spreadsheet does.
 */
export const CLASS_YEARS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Graduate",
  "Alumni",
] as const;

export type ClassYear = (typeof CLASS_YEARS)[number];

/** Normalizes roster/form input to a known value, or null when unrecognized. */
export function normalizeClassYear(value: string | null | undefined): ClassYear | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  return CLASS_YEARS.find((y) => y.toLowerCase() === trimmed) ?? null;
}
