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

  return NextResponse.json(
    {
      commit: sha ? sha.slice(0, 7) : "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      environment: process.env.VERCEL_ENV ?? "development",
      builtAt: process.env.VERCEL_DEPLOYMENT_ID ? undefined : "local build",
      now: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
