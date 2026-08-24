"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { PrimaryBtn, GhostBtn } from "@/components/dashboard/buttons";
import { assignSectorAction } from "@/app/(dashboard)/admin/actions";
import type { CoverageAnalyst } from "@/app/(dashboard)/coverage/page";
import type { ResearchItem, UserRole } from "@/lib/types";
import { SECTOR_COLORS, SECTOR_FALLBACK_COLOR } from "@/lib/sectors";

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
  viewerRole,
}: {
  analysts: CoverageAnalyst[];
  research: ResearchItem[];
  sectors: string[];
  viewerRole: UserRole;
}) {
  const canAssign = viewerRole === "admin" || viewerRole === "developer" || viewerRole === "pm";
  const [assignOpen, setAssignOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Coverage is a sector assignment, not a role — anyone with a coverage
  // sector set (analyst, pm, admin, developer) counts toward that sector.
  const sectorMap = useMemo(() => {
    const map: Record<string, { analysts: CoverageAnalyst[]; tickers: string[] }> = {};
    for (const s of sectors) {
      const sAnalysts = analysts.filter(
        (a) => a.sector?.toLowerCase() === s.toLowerCase(),
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

  // Every user shows up here with what they cover, regardless of role.
  const activeAnalysts = analysts;
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
      : "X.X";

  const kpiTiles = [
    {
      label: "Sectors covered",
      value: `${covered} / ${sectors.length}`,
      sub: `${gaps + uncovered} need attention`,
    },
    {
      label: "Team members",
      value: String(activeAnalysts.length),
      sub: "Covering a sector",
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
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Sector Coverage"
        meta={`${covered} / ${sectors.length} sectors covered`}
        actions={
          canAssign ? (
            <PrimaryBtn onClick={() => setAssignOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Assign analyst
            </PrimaryBtn>
          ) : undefined
        }
      />

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6">
          <div className="w-full max-w-sm border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="panel-title">Assign analyst</h2>
              <button type="button" onClick={() => setAssignOpen(false)} className="text-ink-3 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              action={(fd) => {
                startTransition(async () => {
                  await assignSectorAction(fd);
                  setAssignOpen(false);
                });
              }}
              className="flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1">
                <span className="caps">Member</span>
                <select
                  name="id"
                  required
                  className="border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
                >
                  {analysts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.sector ? `(currently ${a.sector})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="caps">Sector</span>
                <select
                  name="sector"
                  required
                  className="border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
                >
                  {sectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <GhostBtn type="button" onClick={() => setAssignOpen(false)}>
                  Cancel
                </GhostBtn>
                <PrimaryBtn type="submit" disabled={isPending}>
                  {isPending ? "Assigning…" : "Assign"}
                </PrimaryBtn>
              </div>
            </form>
          </div>
        </div>
      )}

      <KpiRow tiles={kpiTiles} />

      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)" }}
      >
        {/* Left — Sectors × Analysts table */}
        <TableShell
          title="Sectors"
          count={sectors.length}
        >
          <table className="w-full">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
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
                const leads = sAnalysts.filter((a) => a.role !== "analyst");
                const analystCount = sAnalysts.length;
                const color = SECTOR_COLORS[sector] ?? SECTOR_FALLBACK_COLOR;

                return (
                  <tr
                    key={sector}
                    className="border-b border-line last:border-b-0 transition hover:bg-paper-3"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-none"
                          style={{ background: color }}
                        />
                        <span className="text-[14px] text-ink">{sector}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[14px] text-ink-2">
                      {leads.length > 0 ? (
                        <span className="text-ink">{leads.map((a) => a.name).join(", ")}</span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[14px] text-ink">
                      {analystCount}
                    </td>
                    <td className="px-3 py-2">
                      {tickers.length === 0 ? (
                        <span className="text-[14px] text-ink-3">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tickers.slice(0, 6).map((t) => (
                            <StatusPill key={t} label={t} tone="neutral" dot={false} />
                          ))}
                          {tickers.length > 6 && (
                            <span className="text-[12px] text-ink-3">
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
        <div className="panel flex h-full min-h-0 flex-col p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
            User Load
          </p>
          <p className="mt-0.5 text-[15px] font-semibold text-ink">
            Tickers per user
          </p>
          <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {activeAnalysts.length === 0 && (
              <p className="text-[13px] text-ink-3">No users yet.</p>
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
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-paper-2 text-[12px] font-semibold text-ink">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="truncate text-[13.5px] text-ink">
                        {a.name}
                        <span className="ml-1.5 text-[12px] text-ink-3">
                          {a.sector ?? "Unassigned"}
                        </span>
                      </span>
                      <span className="ml-2 shrink-0 tabular-nums text-[12px] text-ink-3">
                        {load} tickers
                      </span>
                    </div>
                    <div className="mt-0.5 h-[3px] w-full rounded-none bg-paper-2">
                      <div
                        className="h-full rounded-none transition-all"
                        style={{
                          width: `${barPct}%`,
                          background:
                            load > 0 ? "var(--garnet)" : "var(--line-2)",
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
