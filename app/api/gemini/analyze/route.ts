import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/require-session";
import { analyzePitchPdf } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  try {
    const body = (await request.json()) as { pdfUrl?: string; researchId?: string };
    const url = body.pdfUrl?.trim();
    const researchId = body.researchId?.trim();
    if (!url) {
      return NextResponse.json({ ok: false, message: "pdfUrl required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Return cached analysis if it already exists
    if (researchId) {
      const { data: existing } = await admin
        .from("research_posts")
        .select("ai_analysis")
        .eq("id", researchId)
        .maybeSingle();

      if (existing?.ai_analysis) {
        return NextResponse.json({ ok: true, analysis: existing.ai_analysis, cached: true });
      }
    }

    const pdfRes = await fetch(url);
    if (!pdfRes.ok) {
      return NextResponse.json({ ok: false, message: "Could not fetch PDF" }, { status: 400 });
    }
    const buf = await pdfRes.arrayBuffer();
    const analysis = await analyzePitchPdf(buf);

    // Persist to DB so future requests hit the cache
    if (researchId) {
      await admin
        .from("research_posts")
        .update({ ai_analysis: analysis })
        .eq("id", researchId);
    }

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
