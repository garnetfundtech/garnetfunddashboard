"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, Minus, Plus, Printer, Trash2, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import { ResearchUploadModal } from "@/components/dashboard/research-upload-modal";
import { PdfViewer, usePdfPrint } from "@/components/dashboard/pdf-viewer";
import { StatusPill, type Tone } from "@/components/dashboard/status-pill";
import { signFile } from "@/lib/sign-client";
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

function tagTone(status: string): Tone {
  if (status === "became_position") return "accent";
  if (status === "under_review") return "amber";
  return "neutral";
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
    developer: "text-info",
    admin: "text-warn",
    pm: "text-garnet",
    analyst: "text-info",
  };
  return map[role];
}

const ACTION_BTN =
  "flex w-full items-center justify-center gap-2 rounded-none bg-paper-2 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper-2";

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

  function loadFileUrls(item: ResearchItem) {
    void signFile("research", item.id).then(({ viewUrl, downloadUrl }) => {
      setOpened((current) =>
        current && current.id === item.id
          ? { ...current, viewUrl: viewUrl ?? undefined, downloadUrl: downloadUrl ?? undefined }
          : current,
      );
    });
  }

  useEffect(() => {
    if (!initialOpenId) return;
    const item = items.find((i) => i.id === initialOpenId);
    if (!item) return;
    startTransition(() => {
      setOpened(item);
      loadFileUrls(item);
      if (initialMode === "edit" && canManage(item)) setEditing(item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialOpenId]);

  function handleRowClick(item: ResearchItem) {
    setCurrentPage(1);
    setTotalPages(null);
    setZoom(1);
    setOpened(item);
    loadFileUrls(item);
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
    { label: "Total reads", value: "XX", sub: "Across all reports" },
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
        title="Research Archive"
        meta={`${items.length} report${items.length === 1 ? "" : "s"}`}
        actions={<ResearchUploadModal />}
      />

      <KpiRow tiles={kpiTiles} />

      <div
        className="grid gap-3"
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
              <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
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
                    className="px-3 py-12 text-center text-[13.5px] text-ink-3"
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
                    className="cursor-pointer border-b border-line last:border-b-0 transition hover:bg-paper-3"
                    onClick={() => handleRowClick(item)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusPill label="PDF" tone="rose" dot={false} />
                        <span className="line-clamp-1 text-[14px] font-medium text-ink">
                          {item.title}
                        </span>
                        {isHeld && <StatusPill label="Held" tone="emerald" dot={false} />}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {sym ? (
                        <StatusPill label={sym} tone="neutral" dot={false} />
                      ) : (
                        <span className="text-[14px] text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill label={tagLabel(item.thesisStatus)} tone={tagTone(item.thesisStatus)} />
                    </td>
                    <td className={`px-3 py-2 text-[14px] ${roleColor(item.uploaderRole)}`}>
                      {item.analystName ?? item.author}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">
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
                          className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-neg"
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
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Most read
          </p>
          <p className="mt-0.5 text-[15px] font-semibold text-ink">
            Top reports this term
          </p>
          <ol className="mt-3 space-y-0.5">
            {topReports.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleRowClick(item)}
                  className="flex w-full items-start gap-2 rounded-none px-1.5 py-1 text-left hover:bg-paper-3"
                >
                  <span className="mt-0.5 w-4 shrink-0 text-right tabular-nums text-[11px] text-ink-3">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-ink">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-ink-3">
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
        <div className="fixed inset-0 z-50 flex bg-ink/50 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <PdfViewer
              url={opened.viewUrl}
              scale={zoom}
              onLoadTotalPages={(n) => setTotalPages(n)}
              onPageChange={setCurrentPage}
            />
          </div>
          <div className="flex w-[min(380px,100vw)] shrink-0 flex-col p-4 pl-0">
            <div className="panel flex flex-1 flex-col min-h-0 overflow-hidden rounded-none">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {opened.ticker && opened.ticker !== "—" && (
                      <p className="caps-label text-ink">
                        {opened.ticker.toUpperCase()}
                      </p>
                    )}
                    <h2 className="mt-0.5 text-base font-semibold leading-snug text-ink">
                      {opened.title}
                    </h2>
                  </div>
                  <button
                    onClick={() => setOpened(null)}
                    className="mt-0.5 shrink-0 rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Analyst</dt>
                    <dd className="font-medium text-ink">
                      {opened.analystName ?? opened.author}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-3">Role</dt>
                    <dd className={`font-medium capitalize ${roleColor(opened.uploaderRole)}`}>
                      {opened.uploaderRole}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Date</dt>
                    <dd className="text-ink">{fmtDate(opened.updatedAt)}</dd>
                  </div>
                  {totalPages !== null && (
                    <div className="flex justify-between">
                      <dt className="text-ink-3">Pages</dt>
                      <dd className="tabular-nums text-ink">
                        {currentPage} of {totalPages}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="shrink-0 space-y-2 border-t border-line p-5 pt-4">
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
                  <span className="flex flex-1 items-center justify-center rounded-none bg-paper-2 px-3 py-2.5 text-sm tabular-nums text-ink">
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
                    <div className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-none bg-paper-3 px-3 py-2.5 text-sm text-ink-3">
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
                    className="flex w-full items-center justify-center gap-2 rounded-none bg-neg-soft px-3 py-2.5 text-sm font-medium text-neg transition-colors hover:bg-neg-soft disabled:opacity-50"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-6 backdrop-blur-md">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Research</p>
                <h2 className="text-base font-semibold text-ink">Edit</h2>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
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
                className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
                placeholder="Title"
                required
              />
              <input
                name="ticker"
                defaultValue={editing.ticker === "—" ? "" : editing.ticker}
                className="glass-input w-full px-3 py-2.5 text-sm uppercase text-ink outline-none placeholder:text-ink-3"
                placeholder="Ticker"
              />
              <input
                name="sector"
                defaultValue={editing.sector ?? ""}
                className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
                placeholder="Sector tag"
              />
              <input
                name="analystName"
                defaultValue={editing.analystName ?? ""}
                className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
                placeholder="Analyst name"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-ink transition-colors hover:bg-paper-2"
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
                  className="rounded-none px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                >
                  Cancel
                </button>
                <PrimaryBtn type="submit" disabled={isPending}>
                  Save
                </PrimaryBtn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
