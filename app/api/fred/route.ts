import { NextRequest, NextResponse } from "next/server";
import { fetchFredSeries, toYearOverYearPct } from "@/lib/fred";
import { requireSessionUser } from "@/lib/require-session";

export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  const seriesParam = request.nextUrl.searchParams.get("series") ?? "T10Y2Y";
  const ids = seriesParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    return NextResponse.json({ ok: false, message: "series param required" }, { status: 400 });
  }

  try {
    const result: Record<string, { observations: { date: string; value: number | null }[] }> = {};
    await Promise.all(
      ids.map(async (id) => {
        let obs = await fetchFredSeries(id, { observationStart: "2015-01-01" });
        if (id === "CPIAUCSL") {
          obs = toYearOverYearPct(obs);
        }
        result[id] = { observations: obs };
      }),
    );
    return NextResponse.json({ ok: true, series: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "FRED error" },
      { status: 500 },
    );
  }
}
