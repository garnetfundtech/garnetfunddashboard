import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireSessionUser } from "@/lib/require-session";
import { syncResearchInbox } from "@/lib/corporate-research-sync";

export const dynamic = "force-dynamic";
// A first run downloads up to MAX_PER_RUN full emails over IMAP.
export const maxDuration = 60;

/**
 * The daily Corporate Research import (see vercel.json), and the route behind
 * the tab's "Check for new" button.
 *
 * Daily rather than hourly because the Vercel plan rejects any cron schedule
 * more frequent than once a day — and rejects it by failing the deploy, which
 * is how the pipeline once went quiet for three days (see /api/version). The
 * button covers the gap for anyone who wants today's note before tomorrow.
 *
 * Two ways in: the cron secret, or any approved member's session. Importing
 * is idempotent and only ever adds what is already in the inbox, so there is
 * nothing for a role gate to protect.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!(secret && auth === `Bearer ${secret}`)) {
    const session = await requireSessionUser();
    if (session.response) return session.response;
    const profile = await getCurrentProfile();
    if (!profile || profile.status !== "approved") {
      return NextResponse.json({ ok: false, message: "Members only." }, { status: 403 });
    }
  }

  try {
    const result = await syncResearchInbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Import failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

// Vercel cron issues GET; support both.
export async function GET(request: NextRequest) {
  return handle(request);
}
