/**
 * Where this app actually lives, for links that leave the browser.
 *
 * Every link in an email is built from this. It used to be read straight off
 * NEXT_PUBLIC_APP_URL at each call site, with three different answers when the
 * variable was missing: the invite mail fell back to http://localhost:3000 and
 * sent invitees to their own machine, while the risk alerts and the Schwab
 * warning fell back to null and quietly dropped their button. A variable that
 * is only set locally is exactly the shape of that bug — nothing fails in
 * development, and production sends the broken link.
 *
 * So the variable is now the first answer rather than the only one. On Vercel
 * the platform already knows the domain and injects it, which needs no
 * configuration to be right, and a NEXT_PUBLIC_APP_URL still pointing at
 * localhost in a deployed environment is treated as the mistake it is.
 */

/**
 * Last resort, for a deployment that reports no domain of its own. Replace
 * this the day the fund puts a real domain in front of Vercel.
 */
const PRODUCTION_URL = "https://garnetfunddashboard-gules.vercel.app";

function isLoopback(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(url);
}

/** No trailing slash, so callers can append "/risk" and friends directly. */
export function siteUrl(): string {
  const deployed = Boolean(process.env.VERCEL_ENV);
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured && !(deployed && isLoopback(configured))) return configured;

  // Vercel gives the project's own production domain, and the per-deployment
  // one as a fallback. Both arrive without a scheme.
  const injected =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (injected) return `https://${injected.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return deployed ? PRODUCTION_URL : "http://localhost:3000";
}
