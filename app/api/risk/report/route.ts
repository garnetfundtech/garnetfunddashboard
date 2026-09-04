import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/require-session";
import { fetchTreasuryRate } from "@/lib/fmp";
import { getRiskModel } from "@/lib/risk-live";
import { getAlertLog } from "@/lib/risk-episodes";
import { getNavSeries } from "@/lib/risk-nav";
import {
  REPORT_PACKS,
  buildReportingModel,
  renderPack,
  type PackId,
  type PeriodKey,
} from "@/lib/risk-reporting";

export const dynamic = "force-dynamic";

const PERIODS = new Set<PeriodKey>(["wtd", "mtd", "std", "fytd", "inception"]);

/**
 * §5.4 report packs. Each pack is a saved view with a one-click export:
 *
 *   GET /api/risk/report?pack=monthly&period=mtd          → printable HTML
 *   GET /api/risk/report?pack=monthly&format=markdown     → markdown
 *   GET /api/risk/report?pack=monthly&format=json         → structured JSON
 *
 * The HTML opens with the browser's own print dialog, which is how the spec's
 * "exportable to PDF" is met without shipping a headless-browser renderer for
 * a report five people read.
 *
 * Contains fund data, so it needs a session — or a cron bearer token, for
 * automated delivery on the cadences Gov. IV.a fixes.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!cronOk) {
    const { user, response } = await requireSessionUser();
    if (!user) return response;
  }

  const params = request.nextUrl.searchParams;
  const packId = (params.get("pack") ?? "monthly") as PackId;
  const pack = REPORT_PACKS.find((p) => p.id === packId) ?? REPORT_PACKS[1];
  const periodParam = params.get("period");
  const period: PeriodKey = PERIODS.has(periodParam as PeriodKey) ? (periodParam as PeriodKey) : pack.period;
  const format = params.get("format");

  const [model, alertLog, navSeries, tbill] = await Promise.all([
    getRiskModel(),
    getAlertLog(500),
    getNavSeries(),
    fetchTreasuryRate(),
  ]);

  const report = await buildReportingModel({
    period,
    model,
    navSeries,
    alertLog,
    config: model.config,
    riskFreePct: tbill?.month3 ?? null,
  });

  const markdown = renderPack(pack, report, model);

  if (format === "json") {
    return NextResponse.json({ pack, report, markdown });
  }
  if (format === "markdown") {
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="garnet-fund-${pack.id}-${report.to}.md"`,
      },
    });
  }

  return new NextResponse(toPrintableHtml(pack.title, markdown), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Minimal markdown → print-ready HTML. Deliberately handles only what
 * renderPack emits (headings, bullets, tables, bold, italics) rather than
 * pulling a full parser into a route that renders one known document shape.
 */
function toPrintableHtml(title: string, markdown: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>");

  const out: string[] = [];
  let inList = false;
  let table: string[][] | null = null;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const closeTable = () => {
    if (!table) return;
    const [head, ...body] = table;
    out.push("<table><thead><tr>");
    for (const cell of head) out.push(`<th>${inline(cell)}</th>`);
    out.push("</tr></thead><tbody>");
    for (const row of body) {
      out.push("<tr>");
      for (const cell of row) out.push(`<td>${inline(cell)}</td>`);
      out.push("</tr>");
    }
    out.push("</tbody></table>");
    table = null;
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();

    if (line.startsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      // The |---|---| separator row carries no data.
      if (cells.every((c) => /^-{2,}$/.test(c))) continue;
      closeList();
      table = table ?? [];
      table.push(cells);
      continue;
    }
    closeTable();

    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (/^\s*-\s/.test(line)) {
      const depth = (line.match(/^\s*/)?.[0].length ?? 0) >= 2 ? 1 : 0;
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li class="d${depth}">${inline(line.replace(/^\s*-\s/, ""))}</li>`);
    } else if (!line) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  closeTable();

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Garnet Fund — ${esc(title)}</title>
<style>
  @page { margin: 18mm; }
  body { font: 13px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; color: #17181a; max-width: 46rem; margin: 2rem auto; padding: 0 1.5rem; }
  h1 { font-size: 22px; margin: 0 0 .6rem; }
  h2 { font-size: 16px; margin: 1.6rem 0 .4rem; border-bottom: 1px solid #d8d5c8; padding-bottom: .2rem; }
  h3 { font-size: 14px; margin: 1.1rem 0 .3rem; }
  p { margin: .3rem 0; }
  ul { margin: .3rem 0; padding-left: 1.1rem; }
  li.d1 { margin-left: 1rem; list-style: circle; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; font-size: 12px; }
  th, td { border: 1px solid #d8d5c8; padding: 4px 7px; text-align: left; }
  th { background: #ebe9e1; font-weight: 600; }
  @media print { .noprint { display: none; } }
</style></head>
<body>
<p class="noprint"><button onclick="window.print()">Print / save as PDF</button></p>
${out.join("\n")}
</body></html>`;
}
