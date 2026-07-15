/**
 * Report builder (pure). Assembles the daily / weekly / monthly cadences Arav
 * laid out from an evaluated RiskModel (+ optional snapshot history), as both
 * structured sections and a markdown body ready to email or print.
 */
import { findRow, type RiskModel } from "@/lib/risk-engine";
import type { RiskStatus } from "@/lib/risk-parameters";

export type ReportPeriod = "daily" | "weekly" | "monthly";

export type ReportLine = { label: string; value: string; status?: RiskStatus; note?: string };
export type ReportSection = { title: string; lines: ReportLine[] };

export type SnapshotRow = {
  captured_on: string;
  nav: number | null;
  drawdown_from_high: number | null;
  sharpe: number | null;
};

export type RiskReport = {
  period: ReportPeriod;
  generatedAt: string;
  source: "live" | "sample" | "mixed";
  headline: { net: string; gross: string; beta: string };
  status: { green: number; yellow: number; red: number };
  sections: ReportSection[];
  markdown: string;
};

const PERIOD_TITLE: Record<ReportPeriod, string> = {
  daily: "Daily Risk Snapshot (~5 min)",
  weekly: "Weekly Risk Review (~20 min)",
  monthly: "Monthly Report — Committee",
};

function line(model: RiskModel, id: string): ReportLine {
  const row = findRow(model, id);
  return {
    label: row?.limit.label ?? id,
    value: row?.display ?? "—",
    status: row?.status,
    note: row?.limit.target,
  };
}

export function buildRiskReport(
  model: RiskModel,
  period: ReportPeriod,
  history: SnapshotRow[] = [],
): RiskReport {
  const sections: ReportSection[] = [];

  const exposureLines: ReportLine[] = [
    line(model, "net-exposure"),
    line(model, "gross-exposure"),
    line(model, "net-beta"),
  ];
  if (model.longBook?.largest) {
    exposureLines.push({
      label: "Largest Long",
      value: `${model.longBook.largest.ticker} · ${model.longBook.largest.weight.toFixed(1)}%`,
    });
  }
  if (model.shortBook?.largest) {
    exposureLines.push({
      label: "Largest Short",
      value: `${model.shortBook.largest.ticker} · ${model.shortBook.largest.weight.toFixed(1)}%`,
    });
  }
  sections.push({ title: "Exposure & Neutrality", lines: exposureLines });

  if (period === "weekly" || period === "monthly") {
    sections.push({
      title: "Sector Long-vs-Short Balance",
      lines: model.sectorBalance.slice(0, 6).map((s) => ({
        label: s.sector,
        value: `L ${s.longPct.toFixed(1)}% / S ${s.shortPct.toFixed(1)}% · gap ${s.gapPct.toFixed(1)}%`,
        status: s.gapPct <= 3.5 ? "green" : s.gapPct <= 5 ? "yellow" : "red",
      })),
    });
  }

  if (period === "monthly") {
    sections.push({
      title: "Performance (vs T-bills)",
      lines: [line(model, "sharpe"), line(model, "sortino"), line(model, "realized-vol"), line(model, "r2-spx"), line(model, "calmar"), line(model, "long-alpha"), line(model, "short-alpha")],
    });
    sections.push({
      title: "Risk — VaR / Drawdown / Stress",
      lines: [
        line(model, "var-95"),
        line(model, "cvar-95"),
        line(model, "drawdown-from-high"),
        {
          label: "Worst Stress Scenario",
          value: model.worstStress ? `${model.worstStress.label}: ${model.worstStress.pnlPct.toFixed(1)}%` : "—",
          status: model.worstStress && model.worstStress.pnlPct < -10 ? "red" : "green",
        },
      ],
    });
    sections.push({
      title: "Factor Neutrality",
      lines: [line(model, "factor-size"), line(model, "factor-value"), line(model, "factor-momentum")],
    });
    sections.push({
      title: "Costs & Liquidity",
      lines: [line(model, "borrow-drag"), line(model, "turnover"), line(model, "liquidity-exit"), line(model, "margin-buffer")],
    });
    if (history.length >= 2) {
      const first = history[history.length - 1];
      const last = history[0];
      const navChange = first.nav && last.nav ? ((last.nav - first.nav) / first.nav) * 100 : null;
      sections.push({
        title: "Trend (from snapshots)",
        lines: [
          { label: "NAV change over period", value: navChange != null ? `${navChange >= 0 ? "+" : ""}${navChange.toFixed(2)}%` : "—" },
          { label: "Snapshots on file", value: String(history.length) },
        ],
      });
    }
  }

  // Flags: always list breaches; weekly/monthly also list watches.
  const breaches = model.breaches.map((r) => ({
    label: r.limit.label,
    value: r.display,
    status: "red" as RiskStatus,
    note: `target ${r.limit.target}`,
  }));
  const watches =
    period === "daily"
      ? []
      : model.groups
          .flatMap((g) => g.rows)
          .filter((r) => r.status === "yellow")
          .map((r) => ({ label: r.limit.label, value: r.display, status: "yellow" as RiskStatus, note: `target ${r.limit.target}` }));

  sections.push({
    title: "Flags",
    lines: breaches.length || watches.length ? [...breaches, ...watches] : [{ label: "All limits in policy", value: "✓" }],
  });

  const report: RiskReport = {
    period,
    generatedAt: model.asOf,
    source: model.source,
    headline: {
      net: model.headline.net.display,
      gross: model.headline.gross.display,
      beta: model.headline.beta.display,
    },
    status: { green: model.counts.green, yellow: model.counts.yellow, red: model.counts.red },
    sections,
    markdown: "",
  };
  report.markdown = toMarkdown(report);
  return report;
}

function toMarkdown(r: RiskReport): string {
  const lines: string[] = [];
  lines.push(`# Garnet Fund — ${PERIOD_TITLE[r.period]}`);
  lines.push("");
  lines.push(`_${r.source === "live" ? "Live data" : "Sample book"} · generated ${r.generatedAt}_`);
  lines.push("");
  lines.push(`**Net ${r.headline.net} · Gross ${r.headline.gross} · Beta ${r.headline.beta}**`);
  lines.push(`Status: 🟢 ${r.status.green} in policy · 🟡 ${r.status.yellow} watch · 🔴 ${r.status.red} breach`);
  lines.push("");
  for (const section of r.sections) {
    lines.push(`## ${section.title}`);
    for (const l of section.lines) {
      const dot = l.status === "red" ? "🔴 " : l.status === "yellow" ? "🟡 " : l.status === "green" ? "🟢 " : "";
      lines.push(`- ${dot}**${l.label}:** ${l.value}${l.note ? ` _(${l.note})_` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
