import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/require-session";
import { analyzePitchPdf } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  try {
    const body = (await request.json()) as { pdfUrl?: string };
    const url = body.pdfUrl?.trim();
    if (!url) {
      return NextResponse.json({ ok: false, message: "pdfUrl required" }, { status: 400 });
    }

    const pdfRes = await fetch(url);
    if (!pdfRes.ok) {
      return NextResponse.json({ ok: false, message: "Could not fetch PDF" }, { status: 400 });
    }
    const buf = await pdfRes.arrayBuffer();
    const analysis = await analyzePitchPdf(buf);
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
