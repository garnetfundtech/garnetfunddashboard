/**
 * Resolved hex values for the design tokens in app/globals.css.
 *
 * These exist because SVG *presentation attributes* — what Recharts writes for
 * `stroke`, `fill`, `stopColor`, and axis `tick.fill` — are attributes, not CSS
 * declarations, so `var(--garnet)` in that position never resolves and the mark
 * renders black. Anywhere a color lands in a `style={{ … }}` object, keep using
 * the CSS variable instead; only reach for these constants when the value is
 * bound for an SVG attribute.
 *
 * Keep in sync with the `:root` block in app/globals.css.
 */
export const THEME = {
  paper: "#f2f1ea",
  paper2: "#e4e2d9",
  paper3: "#ebe9e1",
  surface: "#ffffff",

  ink: "#17181a",
  ink2: "#5c5e5a",
  ink3: "#8b8d86",

  line: "rgba(23, 24, 26, 0.12)",
  line2: "rgba(23, 24, 26, 0.22)",

  garnet: "#8e0604",
  garnetHover: "#a80705",

  pos: "#1a6b45",
  neg: "#8e0604",
  warn: "#8a5a05",
  info: "#1f4e79",
} as const;

/** Chart series ramp: garnet leads, then neutral inks. */
export const CHART_SERIES = [
  THEME.garnet,
  THEME.ink,
  THEME.ink3,
  "#c07472",
  THEME.ink2,
  "#d8d5c8",
] as const;
