import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which commit is actually serving.
 *
 * Added because "is it live?" was repeatedly unanswerable: the deployment
 * pipeline silently stopped for three days behind an invalid cron schedule,
 * and the only way to tell which build was running was to probe for routes
 * that had been added or deleted. Vercel injects the commit it built from, so
 * this reports it directly.
 *
 * Deliberately unauthenticated — it has to be checkable when nobody is logged
 * in, which is exactly when a bad deploy needs diagnosing. It exposes a commit
 * hash and a branch name and nothing else: no fund data, no configuration, no
 * account identifiers.
 */
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const set = (name: string) => Boolean(process.env[name]?.trim());

  return NextResponse.json(
    {
      commit: sha ? sha.slice(0, 7) : "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      environment: process.env.VERCEL_ENV ?? "development",
      now: new Date().toISOString(),
      // Whether each integration has credentials in THIS environment —
      // booleans only, never a value. Environment variables are set in a
      // dashboard rather than in the repo, so there is otherwise no way to
      // tell from outside whether a key actually landed in production or was
      // set somewhere the app cannot read, which has already happened once.
      configured: {
        supabase: set("NEXT_PUBLIC_SUPABASE_URL") && set("SUPABASE_SERVICE_ROLE_KEY"),
        schwab: set("SCHWAB_CLIENT_ID") && set("SCHWAB_CLIENT_SECRET"),
        marketData: set("FMP_API_KEY"),
        macroCalendar: set("FRED_API_KEY"),
        cronSecret: set("CRON_SECRET"),
        alertSmtp: set("SMTP_USER") && set("SMTP_APP_PASSWORD"),
        alertRecipients: set("RISK_ALERT_EMAIL") || set("RISK_EMAIL_RISK_MANAGER"),
        alertAlwaysCopy: set("RISK_EMAIL_ALWAYS"),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
