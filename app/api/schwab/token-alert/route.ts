import { NextResponse, type NextRequest } from "next/server";
import { runSchwabTokenAlert, humaniseDuration } from "@/lib/schwab-token-alert";
import { getCurrentProfile } from "@/lib/auth";
import { requireSessionUser } from "@/lib/require-session";

export const dynamic = "force-dynamic";

/**
 * The daily Schwab re-auth check (see vercel.json).
 *
 * Scheduled every day rather than on weekdays like the risk crons: the
 * seven-day refresh window pays no attention to the trading calendar, and a
 * token that lapses on a Sunday takes the whole dashboard down with it.
 *
 * Nothing is sent unless the token is inside its last two days, and never
 * twice for the same token — the de-duplication lives on the row itself, see
 * lib/schwab-token-alert.ts. Safe to call by hand as often as you like.
 *
 * Two ways in: the cron secret, or an admin/developer session for a manual
 * run from a browser. `?force=1` re-sends a notice already sent, which is how
 * you check the plumbing without waiting for a real expiry.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (secret && auth === `Bearer ${secret}`) {
    // cron call — no session required
  } else {
    const session = await requireSessionUser();
    if (session.response) return session.response;

    const profile = await getCurrentProfile();
    if (!profile || (profile.role !== "developer" && profile.role !== "admin")) {
      return NextResponse.json(
        { ok: false, message: "Admins and developers only." },
        { status: 403 },
      );
    }
  }

  const force = ["1", "true", "yes"].includes(
    (request.nextUrl.searchParams.get("force") ?? "").toLowerCase(),
  );

  try {
    const result = await runSchwabTokenAlert({ force });
    return NextResponse.json({
      ok: true,
      ...result,
      remaining:
        result.msRemaining != null ? humaniseDuration(result.msRemaining) : null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Check failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
