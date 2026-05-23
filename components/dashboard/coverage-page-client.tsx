"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { PrimaryBtn } from "@/components/dashboard/buttons";
import type { CoverageAnalyst } from "@/app/(dashboard)/coverage/page";
import type { ResearchItem } from "@/lib/types";

const SECTOR_COLORS: Record<string, string> = {
  Technology: "#a78bfa",
  Healthcare: "#34d399",
  "Financial Services": "#60a5fa",
  "Consumer Cyclical": "#fbbf24",
  "Consumer Defensive": "#fb923c",
  Industrials: "#fb7185",
  "Communication Services": "#22d3ee",
  Energy: "#facc15",
  "Basic Materials": "#94a3b8",
  "Real Estate": "#f472b6",
  Utilities: "#a3e635",
};

type SectorStatus = "covered" | "thin" | "gap" | "uncovered";

function sectorStatus(
  sector: string,
  analysts: CoverageAnalyst[],
  tickers: string[],
): SectorStatus {
  const assigned = analysts.filter(
    (a) => a.sector?.toLowerCase() === sector.toLowerCase(),
  );
  if (assigned.length === 0) return "uncovered";
  if (tickers.length === 0) return "gap";
  if (tickers.length < 2) return "thin";
  return "covered";
}

function statusTone(
  s: SectorStatus,
): "emerald" | "amber" | "rose" | "neutral" {
  if (s === "covered") return "emerald";
  if (s === "thin") return "amber";
  if (s === "gap") return "rose";
  return "neutral";
}

function statusLabel(s: SectorStatus) {
  if (s === "covered") return "Covered";
  if (s === "thin") return "Thin";
  if (s === "gap") return "Coverage gap";
  return "Uncovered";
}

export function CoveragePageClient({
  analysts,
  research,
  sectors,
}: {
  analysts: CoverageAnalyst[];
  research: ResearchItem[];
  sectors: string[];
}) {
  const sectorMap = useMemo(() => {
    const map: Record<string, { analysts: CoverageAnalyst[]; tickers: string[] }> = {};
    for (const s of sectors) {
      const sAnalysts = analysts.filter(
        (a) =>
          a.sector?.toLowerCase() === s.toLowerCase() &&
          (a.role === "analyst" || a.role === "pm"),
      );
      const sResearch = research.filter(
        (r) => r.sector?.toLowerCase() === s.toLowerCase(),
      );
      const tickers = [
        ...new Set(
          sResearch
            .map((r) => r.ticker)
            .filter((t) => t && t !== "—")
            .map((t) => t.toUpperCase()),
        ),
      ];
      map[s] = { analysts: sAnalysts, tickers };
    }
    return map;
  }, [analysts, research, sectors]);

  const activeAnalysts = analysts.filter(
    (a) => a.role === "analyst" || a.role === "pm",
  );
  const covered = sectors.filter((s) => {
    const st = sectorStatus(s, analysts, sectorMap[s]?.tickers ?? []);
    return st === "covered" || st === "thin";
  }).length;
  const gaps = sectors.filter((s) => {
    const st = sectorStatus(s, analysts, sectorMap[s]?.tickers ?? []);
    return st === "gap";
  }).length;
  const uncovered = sectors.filter((s) => {
    const st = sectorStatus(s, analysts, sectorMap[s]?.tickers ?? []);
    return st === "uncovered";
  }).length;

  const loadMap: Record<string, number> = {};
  for (const a of activeAnalysts) {
    if (!a.sector) continue;
    const tickers = sectorMap[a.sector]?.tickers ?? [];
    loadMap[a.id] = tickers.length;
  }
  const avgLoad =
    activeAnalysts.length > 0
      ? (
          Object.values(loadMap).reduce((s, n) => s + n, 0) /
          activeAnalysts.length
        ).toFixed(1)
      : "—";

  const kpiTiles = [
    {
      label: "Sectors covered",
      value: `${covered} / ${sectors.length}`,
      sub: `${gaps + uncovered} need attention`,
    },
    {
      label: "Analysts",
      value: String(activeAnalysts.length),
      sub: "Active this term",
    },
    {
      label: "Coverage gaps",
      value: String(gaps),
      sub: "Lead assigned, no thesis",
      tone: gaps > 0 ? ("neg" as const) : null,
    },
    {
      label: "Uncovered",
      value: String(uncovered),
      sub: "No analyst on sector",
      tone: uncovered > 0 ? ("neg" as const) : null,
    },
    {
      label: "Avg tickers / analyst",
      value: avgLoad,
      sub: "Across active members",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Coverage"
        title="Sector Coverage"
        actions={
          <PrimaryBtn>
            <Plus className="h-3.5 w-3.5" />
            Assign analyst
          </PrimaryBtn>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)" }}
      >
        {/* Left — Sectors × Analysts table */}
        <TableShell
          title="Sectors"
          count={sectors.length}
          actions={
            <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-[1px] text-[10px] text-zinc-400">
              GICS 11
            </span>
          }
        >
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-medium">Sector</th>
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 text-right font-medium">Analysts</th>
                <th className="px-3 py-2 font-medium">Tickers</th>
                <th className="px-3 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((sector) => {
                const { analysts: sAnalysts, tickers } = sectorMap[sector] ?? {
                  analysts: [],
                  tickers: [],
                };
                const status = sectorStatus(sector, analysts, tickers);
                const lead = sAnalysts.find((a) => a.role === "pm");
                const analystCount = sAnalysts.length;
                const color = SECTOR_COLORS[sector] ?? "#94a3b8";

                return (
                  <tr
                    key={sector}
                    className="border-b border-white/[0.025] last:border-b-0 transition hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="text-[12px] text-zinc-200">{sector}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-zinc-400">
                      {lead ? (
                        <span className="text-zinc-200">{lead.name}</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[12px] text-zinc-300">
                      {analystCount}
                    </td>
                    <td className="px-3 py-2">
                      {tickers.length === 0 ? (
                        <span className="text-[12px] text-zinc-600">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tickers.slice(0, 6).map((t) => (
                            <span
                              key={t}
                              className="rounded-[5px] border border-white/[0.06] bg-white/[0.03] px-1.5 py-[1px] text-[10.5px] font-medium text-zinc-200"
                            >
                              {t}
                            </span>
                          ))}
                          {tickers.length > 6 && (
                            <span className="text-[10.5px] text-zinc-500">
                              +{tickers.length - 6}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <StatusPill
                        label={statusLabel(status)}
                        tone={statusTone(status)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>

        {/* Right — Analyst load card */}
        <div className="panel p-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
            Analyst Load
          </p>
          <p className="mt-0.5 text-[13.5px] font-semibold text-white">
            Tickers per analyst
          </p>
          <div className="mt-3 space-y-1.5">
            {activeAnalysts.length === 0 && (
              <p className="text-[11px] text-zinc-600">No analysts yet.</p>
            )}
            {activeAnalysts.map((a) => {
              const load = loadMap[a.id] ?? 0;
              const barPct = Math.min(100, (load / 5) * 100);
              const initials = a.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("");
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[9.5px] font-semibold text-zinc-200">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="truncate text-[11.5px] text-zinc-200">
                        {a.name}
                      </span>
                      <span className="ml-2 shrink-0 tabular-nums text-[10.5px] text-zinc-500">
                        {load} tickers
                      </span>
                    </div>
                    <div className="mt-0.5 h-[3px] w-full rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barPct}%`,
                          background:
                            load > 0 ? "var(--gf-accent)" : "#3f3f46",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
