"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Filter, Minus, Plus, Printer, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn } from "@/components/dashboard/buttons";
import { ResourcesUploadModal } from "@/components/dashboard/resources-upload-modal";
import { PdfViewer, usePdfPrint } from "@/components/dashboard/pdf-viewer";
import type { ResourceWithLinks } from "@/lib/data";
import type { UserRole } from "@/lib/types";
import { canManageContent } from "@/lib/roles";
import {
  deleteResourceAction,
  updateResourceAction,
} from "@/app/(dashboard)/resources/actions";

type CategoryFilter = "All" | string;

function typeChip(title: string) {
  const ext = title.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "bg-rose-500/15 text-rose-300",
    xlsx: "bg-emerald-500/15 text-emerald-300",
    xls: "bg-emerald-500/15 text-emerald-300",
    docx: "bg-blue-500/15 text-blue-300",
    doc: "bg-blue-500/15 text-blue-300",
    mp4: "bg-purple-500/15 text-purple-300",
  };
  const cls = map[ext] ?? "bg-white/[0.05] text-zinc-300";
  const label = ext.toUpperCase() || "FILE";
  return (
    <span
      className={`rounded-[4px] px-1.5 py-[1px] text-[9.5px] font-bold uppercase ${cls}`}
    >
      {label}
    </span>
  );
}

function fmtSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
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

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

const ACTION_BTN =
  "flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10";

export function ResourcesTableClient({
  resources,
  actor,
  initialOpenId = "",
  initialMode = "view",
}: {
  resources: ResourceWithLinks[];
  actor: { id: string; role: UserRole };
  initialOpenId?: string;
  initialMode?: "view" | "edit";
}) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [opened, setOpened] = useState<ResourceWithLinks | null>(null);
  const [editing, setEditing] = useState<ResourceWithLinks | null>(null);
  const [isPending, startTransition] = useTransition();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const doPrint = usePdfPrint(opened?.viewUrl);

  const categories = useMemo(
    () => [...new Set(resources.map((r) => r.category))],
    [resources],
  );

  const filterOptions: CategoryFilter[] = ["All", ...categories.map(titleCase)];

  const filtered = useMemo(() => {
    if (categoryFilter === "All") return resources;
    return resources.filter(
      (r) => titleCase(r.category) === categoryFilter,
    );
  }, [resources, categoryFilter]);

  function canManage(item: ResourceWithLinks) {
    return canManageContent({
      actorId: actor.id,
      actorRole: actor.role,
      ownerId: item.createdBy,
      ownerRole: item.uploaderRole,
    });
  }

  useEffect(() => {
    if (!initialOpenId) return;
    const item = resources.find((r) => r.id === initialOpenId);
    if (!item) return;
    startTransition(() => {
      setOpened(item);
      if (initialMode === "edit" && canManage(item)) setEditing(item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialOpenId]);

  function handleRowClick(item: ResourceWithLinks) {
    setCurrentPage(1);
    setTotalPages(null);
    setZoom(1);
    setOpened(item);
  }

  function handleDelete(item: ResourceWithLinks) {
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(async () => {
      await deleteResourceAction(fd);
      if (opened?.id === item.id) setOpened(null);
    });
  }

  const categoryCounts: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of resources) {
      m[r.category] = (m[r.category] ?? 0) + 1;
    }
    return m;
  }, [resources]);

  const kpiTiles = [
    { label: "Files", value: String(resources.length), sub: "Total uploads" },
    {
      label: "Templates",
      value: String(categoryCounts["pitch"] ?? 0),
      sub: "Pitch templates",
    },
    {
      label: "Onboarding",
      value: String(categoryCounts["training"] ?? 0),
      sub: "Training materials",
    },
    {
      label: "Recordings",
      value: "—",
      sub: "Meeting recordings",
    },
    {
      label: "Policy docs",
      value: String(categoryCounts["playbook"] ?? 0),
      sub: "Playbooks & policies",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Resources"
        title="Resource Library"
        subtitle="Policy, templates, recordings, and onboarding materials."
        actions={
          <>
            <GhostBtn>
              <Filter className="h-3.5 w-3.5" />
              Filters
            </GhostBtn>
            <ResourcesUploadModal />
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <TableShell
        title="Library"
        count={filtered.length}
        actions={
          <FilterTabs
            options={filterOptions}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
              <th className="px-3 py-2 font-medium">By</th>
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
                  No resources match this filter.
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-b border-white/[0.025] last:border-b-0 transition hover:bg-white/[0.02]"
                onClick={() => handleRowClick(item)}
              >
                <td className="px-3 py-2 text-[12px] font-medium text-white">
                  {item.title}
                </td>
                <td className="px-3 py-2 text-[12px] text-zinc-400">
                  {titleCase(item.category)}
                </td>
                <td className="px-3 py-2">{typeChip(item.title)}</td>
                <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">
                  {fmtDate(item.updatedAt)}
                </td>
                <td className="px-3 py-2 text-[12px] text-zinc-400">
                  {item.uploadedBy}
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
            ))}
          </tbody>
        </table>
      </TableShell>

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
                    <p className="caps-label">{titleCase(opened.category)}</p>
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
                    <dt className="text-zinc-500">Uploaded by</dt>
                    <dd className="font-medium text-white">{opened.uploadedBy}</dd>
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
                <button
                  type="button"
                  onClick={() => doPrint()}
                  className={ACTION_BTN}
                >
                  <Printer className="h-4 w-4" />
                  Print
                </button>
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
                <p className="caps-label">Resource</p>
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
                  await updateResourceAction(fd);
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
              <div className="flex gap-3">
                <button
                  type="button"
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/10"
                  onClick={() =>
                    setEditing((prev) =>
                      prev
                        ? { ...prev, downloadEnabled: !prev.downloadEnabled }
                        : prev,
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
