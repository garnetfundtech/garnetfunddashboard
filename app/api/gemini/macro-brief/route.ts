import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/require-session";
import { fetchFredSeries, toYearOverYearPct } from "@/lib/fred";
import { generateMacroBriefing } from "@/lib/gemini";

export async function POST() {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  try {
    const [t10y2y, cpi, pce, dff, unrate] = await Promise.all([
      fetchFredSeries("T10Y2Y", { observationStart: "2023-01-01" }),
      fetchFredSeries("CPIAUCSL", { observationStart: "2018-01-01" }),
      fetchFredSeries("PCEPILFE", { observationStart: "2018-01-01" }),
      fetchFredSeries("DFF", { observationStart: "2020-01-01" }),
      fetchFredSeries("UNRATE", { observationStart: "2020-01-01" }),
    ]);

    const cpiYoy = toYearOverYearPct(cpi);
    const last = (s: { date: string; value: number | null }[]) =>
      [...s].reverse().find((x) => x.value != null);

    const bullets = [
      `10Y-2Y spread latest: ${last(t10y2y)?.value?.toFixed(2) ?? "n/a"}% (${last(t10y2y)?.date})`,
      `CPI YoY latest: ${last(cpiYoy)?.value?.toFixed(2) ?? "n/a"}% (${last(cpiYoy)?.date})`,
      `Core PCE index latest: ${last(pce)?.value?.toFixed(2) ?? "n/a"} (${last(pce)?.date})`,
      `Fed funds effective latest: ${last(dff)?.value?.toFixed(2) ?? "n/a"}% (${last(dff)?.date})`,
      `Unemployment rate latest: ${last(unrate)?.value?.toFixed(2) ?? "n/a"}% (${last(unrate)?.date})`,
    ].join("\n");

    const key = process.env.NEWS_API_KEY;
    let headlines = "";
    if (key) {
      const params = new URLSearchParams({
        q: "Federal Reserve OR inflation OR treasury yields",
        language: "en",
        sortBy: "publishedAt",
        pageSize: "8",
        apiKey: key,
      });
      const nr = await fetch(`https://newsapi.org/v2/everything?${params}`, { cache: "no-store" });
      const nj = (await nr.json()) as { articles?: { title?: string; source?: { name?: string } }[] };
      headlines = (nj.articles ?? [])
        .slice(0, 6)
        .map((a) => `- ${a.title ?? ""} (${a.source?.name ?? ""})`)
        .join("\n");
    }

    const briefing = await generateMacroBriefing(`${bullets}\n\nRecent headlines:\n${headlines || "(none)"}`);
    return NextResponse.json({ ok: true, briefing, generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Briefing failed" },
      { status: 500 },
    );
  }
}
