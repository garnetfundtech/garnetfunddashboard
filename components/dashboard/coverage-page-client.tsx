"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Eye, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { PrimaryBtn, GhostBtn } from "@/components/dashboard/buttons";
import { assignSectorAction } from "@/app/(dashboard)/admin/actions";
import {
  addCoverageTickerAction,
  deleteCoverageTickerAction,
} from "@/app/(dashboard)/coverage/actions";
import { signFile } from "@/lib/sign-client";
import { useClickOutside } from "@/lib/use-click-outside";
import type { CoverageAnalyst } from "@/app/(dashboard)/coverage/page";
import type { CoverageTickerRow, TickerFile } from "@/lib/coverage-tickers";
import type { SymbolMatch } from "@/lib/fmp";
import type { ResearchItem, UserRole } from "@/lib/types";
import { SECTOR_COLORS, SECTOR_FALLBACK_COLOR } from "@/lib/sectors";

type SectorStatus = "covered" | "thin" | "gap" | "uncovered";

/** One ticker as it appears on a sector row, however it got there. */
type TickerEntry = {
  ticker: string;
  companyName: string | null;
  /** Coverage rows behind it — empty when the ticker only came from research. */
  rows: CoverageTickerRow[];
  researchCount: number;
};

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

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function CoveragePageClient({
  analysts,
  research,
  sectors,
  viewerRole,
  viewerId,
  viewerSector,
  coverageTickers,
  filesByTicker,
  initialTicker,
}: {
  analysts: CoverageAnalyst[];
  research: ResearchItem[];
  sectors: string[];
  viewerRole: UserRole;
  viewerId: string;
  viewerSector: string | null;
  coverageTickers: CoverageTickerRow[];
  filesByTicker: Record<string, TickerFile[]>;
  initialTicker: string | null;
}) {
  const canAssign = viewerRole === "admin" || viewerRole === "developer" || viewerRole === "pm";
  const canManageAnyTicker = canAssign;
  const [assignOpen, setAssignOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [selected, setSelected] = useState<string | null>(initialTicker);
  const [opened, setOpened] = useState<{ title: string; url: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Add-ticker form. Ticker and company are controlled so picking a suggestion
  // can fill both at once; `picked` stops the list reopening on that write.
  const [tickerInput, setTickerInput] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(false);

  // Ticker lookup, debounced. Every state write happens inside the timeout, so
  // an open form never re-renders on the keystroke itself.
  useEffect(() => {
    if (!addOpen || picked) return;
    const q = tickerInput.trim();
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (q.length < 1) {
        setMatches([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/fmp/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        // A slower earlier request must not overwrite a newer one's results.
        if (!cancelled) setMatches(json.ok ? (json.matches as SymbolMatch[]) : []);
      } catch {
        if (!cancelled) setMatches([]);
      }
      if (!cancelled) setSearching(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tickerInput, addOpen, picked]);

  // The suggestion list overlays the company field, so it has to be
  // dismissable without picking something.
  const comboRef = useRef<HTMLDivElement>(null);
  const closeMatches = useCallback(() => setMatches([]), []);
  useClickOutside(comboRef, matches.length > 0, closeMatches);

  function openAddForm() {
    setFormError("");
    setTickerInput("");
    setCompanyInput("");
    setMatches([]);
    setPicked(false);
    setAddOpen(true);
  }

  const analystNameById = useMemo(
    () => new Map(analysts.map((a) => [a.id, a.name])),
    [analysts],
  );

  // Coverage is a sector assignment, not a role — anyone with a coverage
  // sector set (analyst, pm, admin, developer) counts toward that sector.
  const sectorMap = useMemo(() => {
    const map: Record<
      string,
      { analysts: CoverageAnalyst[]; entries: TickerEntry[] }
    > = {};

    for (const s of sectors) {
      const sAnalysts = analysts.filter(
        (a) => a.sector?.toLowerCase() === s.toLowerCase(),
      );

      // A ticker reaches a sector two ways: someone added it, or a research
      // post filed under that sector mentions it. Both land in one list, so
      // the sector row reads the same either way.
      const byTicker = new Map<string, TickerEntry>();

      for (const row of coverageTickers) {
        if (row.sector.toLowerCase() !== s.toLowerCase()) continue;
        const entry = byTicker.get(row.ticker) ?? {
          ticker: row.ticker,
          companyName: null,
          rows: [],
          researchCount: 0,
        };
        entry.rows.push(row);
        entry.companyName = entry.companyName ?? row.companyName;
        byTicker.set(row.ticker, entry);
      }

      for (const r of research) {
        if (r.sector?.toLowerCase() !== s.toLowerCase()) continue;
        const ticker = r.ticker?.trim().toUpperCase();
        if (!ticker || ticker === "—") continue;
        const entry = byTicker.get(ticker) ?? {
          ticker,
          companyName: null,
          rows: [],
          researchCount: 0,
        };
        entry.researchCount += 1;
        byTicker.set(ticker, entry);
      }

      map[s] = {
        analysts: sAnalysts,
        entries: [...byTicker.values()].sort((a, b) =>
          a.ticker.localeCompare(b.ticker),
        ),
      };
    }
    return map;
  }, [analysts, research, sectors, coverageTickers]);

  /**
   * Research tickers that belong to no team — the post has no sector, or one
   * that isn't a coverage team any more. They used to appear nowhere at all,
   * which made a write-up effectively invisible on this page.
   */
  const unassignedEntries = useMemo(() => {
    const known = new Set(sectors.map((s) => s.toLowerCase()));
    const byTicker = new Map<string, TickerEntry>();

    for (const r of research) {
      if (r.sector && known.has(r.sector.toLowerCase())) continue;
      const ticker = r.ticker?.trim().toUpperCase();
      if (!ticker || ticker === "—") continue;
      const entry = byTicker.get(ticker) ?? {
        ticker,
        companyName: null,
        rows: [],
        researchCount: 0,
      };
      entry.researchCount += 1;
      byTicker.set(ticker, entry);
    }

    return [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [research, sectors]);

  /** Everything known about the ticker in the detail panel, across all teams. */
  const selectedDetail = useMemo(() => {
    if (!selected) return null;
    const rows = coverageTickers.filter((r) => r.ticker === selected);
    const researchItems = research.filter(
      (r) => r.ticker?.trim().toUpperCase() === selected,
    );
    const teams = [
      ...new Set([
        ...rows.map((r) => r.sector),
        ...researchItems.map((r) => r.sector).filter((s): s is string => Boolean(s)),
      ]),
    ];
    return {
      ticker: selected,
      companyName: rows.find((r) => r.companyName)?.companyName ?? null,
      rows,
      teams,
      files: filesByTicker[selected] ?? [],
    };
  }, [selected, coverageTickers, research, filesByTicker]);

  const activeAnalysts = analysts;
  const tickersOf = (s: string) => (sectorMap[s]?.entries ?? []).map((e) => e.ticker);

  const covered = sectors.filter((s) => {
    const st = sectorStatus(s, analysts, tickersOf(s));
    return st === "covered" || st === "thin";
  }).length;
  const gaps = sectors.filter((s) => sectorStatus(s, analysts, tickersOf(s)) === "gap").length;
  const uncovered = sectors.filter(
    (s) => sectorStatus(s, analysts, tickersOf(s)) === "uncovered",
  ).length;

  const loadMap: Record<string, number> = {};
  for (const a of activeAnalysts) {
    if (!a.sector) continue;
    loadMap[a.id] = tickersOf(a.sector).length;
  }
  const avgLoad =
    activeAnalysts.length > 0
      ? (
          Object.values(loadMap).reduce((s, n) => s + n, 0) /
          activeAnalysts.length
        ).toFixed(1)
      : "X.X";

  const myTickers = coverageTickers.filter((r) => r.analystId === viewerId);

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
      label: "My tickers",
      value: String(myTickers.length),
      sub: `Avg ${avgLoad} per member`,
    },
  ];

  function runAction(
    action: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>,
    fd: FormData,
    onDone?: () => void,
  ) {
    setFormError("");
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      onDone?.();
    });
  }

  function openFile(file: TickerFile) {
    setOpeningId(file.id);
    void signFile(file.source, file.id).then(({ viewUrl }) => {
      setOpeningId(null);
      if (viewUrl) setOpened({ title: file.title, url: viewUrl });
    });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Sector Coverage"
        meta={`${covered} / ${sectors.length} sectors covered`}
        actions={
          <>
            {canAssign && (
              <GhostBtn onClick={() => setAssignOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Assign analyst
              </GhostBtn>
            )}
            <PrimaryBtn onClick={openAddForm}>
              <Plus className="h-3.5 w-3.5" />
              Add ticker
            </PrimaryBtn>
          </>
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

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6">
          <div className="w-full max-w-sm border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="panel-title">Add a ticker</h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="text-ink-3 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              action={(fd) =>
                runAction(addCoverageTickerAction, fd, () => {
                  setAddOpen(false);
                  setSelected(String(fd.get("ticker") ?? "").trim().toUpperCase());
                })
              }
              className="flex flex-col gap-3"
            >
              <div className="relative flex flex-col gap-1" ref={comboRef}>
                <span className="caps">Ticker</span>
                <input
                  name="ticker"
                  required
                  autoFocus
                  autoComplete="off"
                  maxLength={12}
                  placeholder="Start typing AAPL or Apple"
                  value={tickerInput}
                  onChange={(e) => {
                    setPicked(false);
                    setTickerInput(e.target.value.toUpperCase());
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && matches.length > 0) {
                      // Close the list, don't let the keypress reach the modal.
                      e.stopPropagation();
                      setMatches([]);
                    }
                  }}
                  className="border border-line bg-surface px-2.5 py-2 text-[13px] uppercase text-ink outline-none"
                />
                {searching && !picked && (
                  <span className="absolute right-2 top-[30px] text-[12px] text-ink-3">
                    Searching…
                  </span>
                )}
                {!picked && matches.length > 0 && (
                  <ul className="absolute top-[58px] z-10 max-h-56 w-full overflow-y-auto border border-line bg-surface shadow-sm">
                    {matches.map((match) => (
                      <li key={match.symbol}>
                        <button
                          type="button"
                          onClick={() => {
                            // Fill both fields at once: the company name is what
                            // widens the file match beyond the symbol itself, and
                            // nobody types it by hand.
                            setPicked(true);
                            setTickerInput(match.symbol);
                            setCompanyInput(match.name);
                            setMatches([]);
                          }}
                          className="flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left transition hover:bg-paper-2"
                        >
                          <span className="text-[13px] font-medium text-ink">
                            {match.symbol}
                          </span>
                          <span className="truncate text-[12px] text-ink-3">
                            {match.name}
                            {match.exchange ? ` · ${match.exchange}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="caps">Company name</span>
                <input
                  name="companyName"
                  maxLength={120}
                  placeholder="Apple Inc. (optional)"
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  className="border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
                />
                <span className="text-[12px] text-ink-3">
                  Helps match files that name the company but not the ticker.
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="caps">Team</span>
                <select
                  name="sector"
                  required
                  defaultValue={viewerSector ?? sectors[0]}
                  className="border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
                >
                  {sectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              {formError && <p className="text-[13px] text-neg">{formError}</p>}
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <GhostBtn type="button" onClick={() => setAddOpen(false)}>
                  Cancel
                </GhostBtn>
                <PrimaryBtn type="submit" disabled={isPending}>
                  {isPending ? "Adding…" : "Add ticker"}
                </PrimaryBtn>
              </div>
            </form>
          </div>
        </div>
      )}

      {opened && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6">
          <div className="panel flex h-[85vh] w-full max-w-5xl flex-col p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-ink">{opened.title}</p>
              <button
                type="button"
                onClick={() => setOpened(null)}
                className="rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe src={opened.url} className="min-h-0 flex-1 rounded-none" title={opened.title} />
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
          footer="Click any ticker to see every file in the fund that mentions it."
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
                const { analysts: sAnalysts, entries } = sectorMap[sector] ?? {
                  analysts: [],
                  entries: [],
                };
                const status = sectorStatus(
                  sector,
                  analysts,
                  entries.map((e) => e.ticker),
                );
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
                      {entries.length === 0 ? (
                        <span className="text-[14px] text-ink-3">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {entries.map((entry) => {
                            const fileCount = (filesByTicker[entry.ticker] ?? []).length;
                            const active = selected === entry.ticker;
                            return (
                              <button
                                key={entry.ticker}
                                type="button"
                                onClick={() => setSelected(entry.ticker)}
                                title={`${entry.companyName ?? entry.ticker} — ${fileCount} file${
                                  fileCount === 1 ? "" : "s"
                                }`}
                                className="rounded-none transition hover:opacity-80"
                              >
                                <StatusPill
                                  label={
                                    fileCount > 0
                                      ? `${entry.ticker} · ${fileCount}`
                                      : entry.ticker
                                  }
                                  tone={active ? "accent" : "neutral"}
                                  dot={false}
                                />
                              </button>
                            );
                          })}
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

              {unassignedEntries.length > 0 && (
                <tr className="border-t border-line-2 transition hover:bg-paper-3">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-none"
                        style={{ background: SECTOR_FALLBACK_COLOR }}
                      />
                      <span className="text-[14px] text-ink-2">No team</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[14px] text-ink-3">—</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[14px] text-ink-3">
                    0
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {unassignedEntries.map((entry) => {
                        const fileCount = (filesByTicker[entry.ticker] ?? []).length;
                        return (
                          <button
                            key={entry.ticker}
                            type="button"
                            onClick={() => setSelected(entry.ticker)}
                            title={`${entry.ticker} — from research, no team set`}
                            className="rounded-none transition hover:opacity-80"
                          >
                            <StatusPill
                              label={
                                fileCount > 0
                                  ? `${entry.ticker} · ${fileCount}`
                                  : entry.ticker
                              }
                              tone={selected === entry.ticker ? "accent" : "neutral"}
                              dot={false}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <StatusPill label="From research" tone="neutral" dot={false} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableShell>

        {/* Right — ticker detail when one is picked, analyst load otherwise */}
        {selectedDetail ? (
          <div className="panel flex h-full min-h-0 flex-col p-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 self-start text-[12px] text-ink-3 transition hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to user load
            </button>
            <div className="mt-1.5 flex items-baseline gap-2">
              <p className="text-[15px] font-semibold text-ink">{selectedDetail.ticker}</p>
              {selectedDetail.companyName && (
                <span className="truncate text-[13px] text-ink-3">
                  {selectedDetail.companyName}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {selectedDetail.teams.map((t) => (
                <StatusPill key={t} label={t} tone="neutral" dot={false} />
              ))}
            </div>

            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                Covered by
              </p>
              {selectedDetail.rows.length === 0 ? (
                <p className="mt-1 text-[13px] text-ink-3">
                  Nobody has claimed this name yet — it came from a research post.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {selectedDetail.rows.map((row) => {
                    const mine = row.analystId === viewerId;
                    return (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-2 text-[13.5px] text-ink"
                      >
                        <span className="truncate">
                          {analystNameById.get(row.analystId) ?? "Unknown"}
                          <span className="ml-1.5 text-[12px] text-ink-3">
                            {row.sector} · {fmtDate(row.createdAt)}
                          </span>
                        </span>
                        {(mine || canManageAnyTicker) && (
                          <button
                            type="button"
                            title={mine ? "Remove from my coverage" : "Remove"}
                            disabled={isPending}
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("id", row.id);
                              // Removing the last claim on a ticker leaves
                              // nothing for the panel to describe, so fall
                              // back to the load list rather than an empty
                              // shell.
                              const isLastClaim =
                                selectedDetail.rows.length === 1 &&
                                selectedDetail.files.length === 0;
                              runAction(deleteCoverageTickerAction, fd, () => {
                                if (isLastClaim) setSelected(null);
                              });
                            }}
                            className="shrink-0 p-1 text-ink-3 transition hover:text-neg disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                Files across the fund
              </p>
              <span className="tabular-nums text-[12px] text-ink-3">
                {selectedDetail.files.length}
              </span>
            </div>

            <div className="mt-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {selectedDetail.files.length === 0 && (
                <p className="text-[13px] text-ink-3">
                  No files mention {selectedDetail.ticker} yet. Anything uploaded to
                  research or a team workspace folder with this name shows up here for
                  the whole fund.
                </p>
              )}
              {selectedDetail.files.map((file) => (
                <div
                  key={`${file.source}-${file.id}`}
                  className="border border-line px-2 py-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13.5px] text-ink" title={file.title}>
                      {file.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title="View"
                        disabled={openingId === file.id}
                        onClick={() => openFile(file)}
                        className="p-1 text-ink-3 transition hover:text-ink disabled:opacity-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={file.href}
                        title={
                          file.source === "research"
                            ? "Open in Research"
                            : "Open in Team Workspace"
                        }
                        className="p-1 text-ink-3 transition hover:text-ink"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                  <p className="truncate text-[12px] text-ink-3">
                    {file.location} · {file.addedBy} · {fmtDate(file.createdAt)}
                    {file.matchedOn === "name" && " · matched on name"}
                  </p>
                </div>
              ))}
            </div>

            {formError && <p className="pt-2 text-[13px] text-neg">{formError}</p>}
          </div>
        ) : (
          <div className="panel flex h-full min-h-0 flex-col p-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                My coverage
              </p>
              <span className="tabular-nums text-[12px] text-ink-3">
                {myTickers.length}
              </span>
            </div>
            {myTickers.length === 0 ? (
              <button
                type="button"
                onClick={openAddForm}
                className="mt-1 text-left text-[13px] text-ink-3 transition hover:text-ink"
              >
                You haven&apos;t added any tickers yet — add one.
              </button>
            ) : (
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                {myTickers.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(row.ticker)}
                      className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
                    >
                      <span className="text-[13.5px] font-medium text-ink">
                        {row.ticker}
                      </span>
                      <span className="truncate text-[12px] text-ink-3">
                        {row.companyName ?? row.sector}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Remove from my coverage"
                      disabled={isPending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("id", row.id);
                        runAction(deleteCoverageTickerAction, fd);
                      }}
                      className="shrink-0 p-1 text-ink-3 transition hover:text-neg disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {formError && <p className="pt-1 text-[13px] text-neg">{formError}</p>}

            <p className="mt-3 border-t border-line pt-3 text-[11px] uppercase tracking-[0.08em] text-ink-3">
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
        )}
      </div>
    </div>
  );
}
