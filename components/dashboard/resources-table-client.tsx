"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Minus, Plus, Printer, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import { ResourcesUploadModal } from "@/components/dashboard/resources-upload-modal";
import { PdfViewer, usePdfPrint } from "@/components/dashboard/pdf-viewer";
import { StatusPill, type Tone } from "@/components/dashboard/status-pill";
import { signFile } from "@/lib/sign-client";
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
  const map: Record<string, Tone> = {
    pdf: "rose",
    xlsx: "emerald",
    xls: "emerald",
    docx: "blue",
    doc: "blue",
    mp4: "blue",
  };
  const tone = map[ext] ?? "neutral";
  const label = ext.toUpperCase() || "FILE";
  return <StatusPill label={label} tone={tone} dot={false} />;
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
  "flex w-full items-center justify-center gap-2 rounded-none bg-paper-2 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper-2";

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

  function loadFileUrls(item: ResourceWithLinks) {
    void signFile("resources", item.id).then(({ viewUrl, downloadUrl }) => {
      setOpened((current) =>
        current && current.id === item.id
          ? { ...current, viewUrl: viewUrl ?? undefined, downloadUrl: downloadUrl ?? undefined }
          : current,
      );
    });
  }

  useEffect(() => {
    if (!initialOpenId) return;
    const item = resources.find((r) => r.id === initialOpenId);
    if (!item) return;
    startTransition(() => {
      setOpened(item);
      loadFileUrls(item);
      if (initialMode === "edit" && canManage(item)) setEditing(item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialOpenId]);

  function handleRowClick(item: ResourceWithLinks) {
    setCurrentPage(1);
    setTotalPages(null);
    setZoom(1);
    setOpened(item);
    loadFileUrls(item);
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
      value: "XX",
      sub: "Meeting recordings",
    },
    {
      label: "Policy docs",
      value: String(categoryCounts["playbook"] ?? 0),
      sub: "Playbooks & policies",
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Resource Library"
        meta={`${resources.length} file${resources.length === 1 ? "" : "s"}`}
        actions={<ResourcesUploadModal />}
      />

      <KpiRow tiles={kpiTiles} />

      <TableShell
        title="Library"
        count={filtered.length}
        className="min-h-0 flex-1"
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
            <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
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
                  className="px-3 py-12 text-center text-[13.5px] text-ink-3"
                >
                  No resources match this filter.
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-b border-line last:border-b-0 transition hover:bg-paper-3"
                onClick={() => handleRowClick(item)}
              >
                <td className="px-3 py-2 text-[14px] font-medium text-ink">
                  {item.title}
                </td>
                <td className="px-3 py-2 text-[14px] text-ink-2">
                  {titleCase(item.category)}
                </td>
                <td className="px-3 py-2">{typeChip(item.title)}</td>
                <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">
                  {fmtDate(item.updatedAt)}
                </td>
                <td className="px-3 py-2 text-[14px] text-ink-2">
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
                      className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-neg"
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
        <div className="fixed inset-0 z-50 flex bg-ink/50 backdrop-blur-md">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
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
                    <p className="caps-label">{titleCase(opened.category)}</p>
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
                    <dt className="text-ink-3">Uploaded by</dt>
                    <dd className="font-medium text-ink">{opened.uploadedBy}</dd>
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
                <p className="caps-label">Resource</p>
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
                  await updateResourceAction(fd);
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
              <div className="flex gap-3">
                <button
                  type="button"
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-ink transition-colors hover:bg-paper-2"
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
