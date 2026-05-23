"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, Filter, Minus, Plus, Printer, Trash2, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn } from "@/components/dashboard/buttons";
import { ResearchUploadModal } from "@/components/dashboard/research-upload-modal";
import { PdfViewer, usePdfPrint } from "@/components/dashboard/pdf-viewer";
import type { ResearchItem, UserRole } from "@/lib/types";
import { canManageContent } from "@/lib/roles";
import { deleteResearchAction, updateResearchAction } from "@/app/(dashboard)/research/actions";

type TagFilter = "All" | "Deep Dive" | "Initiation" | "Update";

function tagLabel(status: string): string {
  if (status === "became_position") return "Deep Dive";
  if (status === "active") return "Initiation";
  if (status === "under_review") return "Update";
  return "Macro";
}

function tagStyle(status: string) {
  if (status === "became_position")
    return "border-[var(--gf-accent)]/30 bg-[var(--gf-accent)]/10 text-[var(--gf-accent-fg)]";
  if (status === "under_review")
    return "border-amber-400/25 bg-amber-400/10 text-amber-400";
  return "border-white/[0.08] bg-white/[0.04] text-zinc-400";
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

function roleColor(role: UserRole) {
  const map: Record<UserRole, string> = {
    developer: "text-violet-400",
    admin: "text-amber-400",
    pm: "text-[var(--gf-accent-fg)]",
    analyst: "text-sky-400",
  };
  return map[role];
}

const ACTION_BTN =
  "flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10";

export function ResearchTableClient({
  items,
  actor,
  initialQuery = "",
  initialOpenId = "",
  initialMode = "view",
  holdTickers,
}: {
  items: ResearchItem[];
  actor: { id: string; role: UserRole };
  initialQuery?: string;
  initialOpenId?: string;
  initialMode?: "view" | "edit";
  holdTickers: Set<string>;
}) {
  const [tagFilter, setTagFilter] = useState<TagFilter>("All");
  const [opened, setOpened] = useState<ResearchItem | null>(null);
  const [editing, setEditing] = useState<ResearchItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const doPrint = usePdfPrint(opened?.viewUrl);

  // suppress unused warning for initialQuery (search is handled by the server)
  void initialQuery;

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (tagFilter === "All") return true;
      return tagLabel(item.thesisStatus) === tagFilter;
    });
  }, [items, tagFilter]);

  const thisMonth = useMemo(() => {
    const now = new Date();
    return items.filter((i) => {
      const d = new Date(i.updatedAt);
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    }).length;
  }, [items]);

  const deepDiveCount = items.filter(
    (i) => i.thesisStatus === "became_position",
  ).length;
  const authors = new Set(
    items.map((i) => i.analystName ?? i.author),
  ).size;

  function canManage(item: ResearchItem) {
    return canManageContent({
      actorId: actor.id,
      actorRole: actor.role,
      ownerId: item.createdBy,
      ownerRole: item.uploaderRole,
    });
  }

  useEffect(() => {
    if (!initialOpenId) return;
    const item = items.find((i) => i.id === initialOpenId);
    if (!item) return;
    startTransition(() => {
      setOpened(item);
      if (initialMode === "edit" && canManage(item)) setEditing(item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialOpenId]);

  function handleRowClick(item: ResearchItem) {
    setCurrentPage(1);
    setTotalPages(null);
    setZoom(1);
    setOpened(item);
  }

  function handleDelete(item: ResearchItem) {
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(async () => {
      await deleteResearchAction(fd);
      if (opened?.id === item.id) setOpened(null);
    });
  }

  const kpiTiles = [
    { label: "Reports", value: String(items.length), sub: "All time" },
    {
      label: "This month",
      value: String(thisMonth),
      sub: new Date().toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    },
    { label: "Deep dives", value: String(deepDiveCount), sub: "Long-form theses" },
    { label: "Total reads", value: "—", sub: "Across all reports" },
    {
      label: "Contributing authors",
      value: String(authors),
      sub: "Members publishing",
    },
  ];

  const topReports = useMemo(() => [...items].slice(0, 6), [items]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Research"
        title="Research Archive"
        subtitle="Pitch memos, deep dives, and earnings notes by analyst."
        actions={
          <>
            <GhostBtn>
              <Filter className="h-3.5 w-3.5" />
              Filters
            </GhostBtn>
            <ResearchUploadModal />
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(260px, 0.8fr)",
        }}
      >
        {/* Left — All Reports table */}
        <TableShell
          title="All Reports"
          count={filtered.length}
          actions={
            <FilterTabs
              options={
                ["All", "Deep Dive", "Initiation", "Update"] as TagFilter[]
              }
              value={tagFilter}
              onChange={setTagFilter}
            />
          }
        >
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="px-3 py-2 font-medium">Tag</th>
                <th className="px-3 py-2 font-medium">Author</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-[11.5px] text-zinc-500"
                  >
                    No reports match this filter.
                  </td>
                </tr>
              )}
              {filtered.map((item) => {
                const sym = item.ticker.replace(/—/g, "").trim().toUpperCase();
                const isHeld = sym.length > 0 && holdTickers.has(sym);
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-b border-white/[0.025] last:border-b-0 transition hover:bg-white/[0.02]"
                    onClick={() => handleRowClick(item)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-[4px] bg-rose-500/15 px-1 py-[1px] text-[8.5px] font-bold text-rose-300">
                          PDF
                        </span>
                        <span className="line-clamp-1 text-[12px] font-medium text-white">
                          {item.title}
                        </span>
                        {isHeld && (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-[1px] text-[9px] font-medium text-emerald-400">
                            Held
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {sym ? (
                        <span className="rounded-[5px] border border-white/[0.06] bg-white/[0.03] px-1.5 py-[1px] text-[10.5px] font-medium text-zinc-200">
                          {sym}
                        </span>
                      ) : (
                        <span className="text-[12px] text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-[1px] text-[10px] font-medium ${tagStyle(item.thesisStatus)}`}
                      >
                        {tagLabel(item.thesisStatus)}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-[12px] ${roleColor(item.uploaderRole)}`}>
                      {item.analystName ?? item.author}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">
                      {fmtDate(item.updatedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage(item) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item);
                          }}
                          disabled={isPending}
                          className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>

        {/* Right — Top reports card */}
        <div className="panel p-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
            Most read
          </p>
          <p className="mt-0.5 text-[13.5px] font-semibold text-white">
            Top reports this term
          </p>
          <ol className="mt-3 space-y-0.5">
            {topReports.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleRowClick(item)}
                  className="flex w-full items-start gap-2 rounded-[6px] px-1.5 py-1 text-left hover:bg-white/[0.025]"
                >
                  <span className="mt-0.5 w-4 shrink-0 text-right tabular-nums text-[10px] text-zinc-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium text-white">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {item.analystName ?? item.author}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* PDF viewer modal */}
      {opened && (
        <div className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <PdfViewer
              url={opened.viewUrl}
              scale={zoom}
              onLoadTotalPages={(n) => setTotalPages(n)}
              onPageChange={setCurrentPage}
            />
          </div>
          <div className="flex w-[min(380px,100vw)] shrink-0 flex-col p-4 pl-0">
            <div className="panel flex flex-1 flex-col min-h-0 overflow-hidden rounded-[16px]">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {opened.ticker && opened.ticker !== "—" && (
                      <p className="caps-label text-zinc-300">
                        {opened.ticker.toUpperCase()}
                      </p>
                    )}
                    <h2 className="mt-0.5 text-base font-semibold leading-snug text-white">
                      {opened.title}
                    </h2>
                  </div>
                  <button
                    onClick={() => setOpened(null)}
                    className="mt-0.5 shrink-0 rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Analyst</dt>
                    <dd className="font-medium text-white">
                      {opened.analystName ?? opened.author}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-zinc-500">Role</dt>
                    <dd className={`font-medium capitalize ${roleColor(opened.uploaderRole)}`}>
                      {opened.uploaderRole}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Date</dt>
                    <dd className="text-zinc-300">{fmtDate(opened.updatedAt)}</dd>
                  </div>
                  {totalPages !== null && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Pages</dt>
                      <dd className="tabular-nums text-zinc-300">
                        {currentPage} of {totalPages}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="shrink-0 space-y-2 border-t border-white/[0.06] p-5 pt-4">
                <div className="flex w-full gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))
                    }
                    className={ACTION_BTN}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="flex flex-1 items-center justify-center rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm tabular-nums text-zinc-300">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))
                    }
                    className={ACTION_BTN}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {canManage(opened) && (
                  <button
                    type="button"
                    onClick={() => setEditing(opened)}
                    className={ACTION_BTN}
                  >
                    Edit details
                  </button>
                )}
                <div className="flex gap-1">
                  {opened.downloadEnabled && opened.downloadUrl ? (
                    <Link
                      href={opened.downloadUrl}
                      className={`${ACTION_BTN} flex-1`}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Link>
                  ) : (
                    <div className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-[10px] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-600">
                      <Download className="h-4 w-4" />
                      Download
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => doPrint()}
                    className={`${ACTION_BTN} flex-1`}
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </button>
                </div>
                {canManage(opened) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(opened)}
                    disabled={isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 backdrop-blur-md">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Research</p>
                <h2 className="text-base font-semibold text-white">Edit</h2>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("id", editing.id);
                startTransition(async () => {
                  await updateResearchAction(fd);
                  setEditing(null);
                  setOpened(null);
                });
              }}
            >
              <input
                name="title"
                defaultValue={editing.title}
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Title"
                required
              />
              <input
                name="ticker"
                defaultValue={editing.ticker === "—" ? "" : editing.ticker}
                className="glass-input w-full px-3 py-2.5 text-sm uppercase text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Ticker"
              />
              <input
                name="sector"
                defaultValue={editing.sector ?? ""}
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Sector tag"
              />
              <input
                name="analystName"
                defaultValue={editing.analystName ?? ""}
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Analyst name"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/10"
                  onClick={() =>
                    setEditing((prev) =>
                      prev ? { ...prev, downloadEnabled: !prev.downloadEnabled } : prev,
                    )
                  }
                >
                  {editing.downloadEnabled ? "Downloadable" : "View only"}
                </button>
                <input
                  type="hidden"
                  name="downloadEnabled"
                  value={String(editing.downloadEnabled)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-[10px] px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--gf-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
