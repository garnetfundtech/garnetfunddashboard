import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/fmp";
import { requireSessionUser } from "@/lib/require-session";

/** Ticker/company suggestions for the coverage picker. Signed-in users only. */
export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (query.trim().length < 1) {
    return NextResponse.json({ ok: true, matches: [] });
  }

  try {
    const matches = await searchSymbols(query);
    return NextResponse.json({ ok: true, matches });
  } catch {
    // A dead lookup must not block the form — the field still accepts free text.
    return NextResponse.json({ ok: true, matches: [] });
  }
}
