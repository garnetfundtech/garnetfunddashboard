"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, Minus, Plus, Printer, Search, Sparkles, Trash2, X } from "lucide-react";
import { AiChatTrigger } from "@/components/dashboard/ai-chat-panel";
import Link from "next/link";
import { PdfThumbnail } from "@/components/dashboard/pdf-thumbnail";
import { ResourcesUploadModal } from "@/components/dashboard/resources-upload-modal";
import type { ResourceWithLinks } from "@/lib/data";
import type { StoredAnalysis, UserRole } from "@/lib/types";
import { canManageContent } from "@/lib/roles";
import { deleteResourceAction, updateResourceAction } from "@/app/(dashboard)/resources/actions";
import { PdfViewer, usePdfPrint } from "@/components/dashboard/pdf-viewer";

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function roleColor(role: UserRole) {
  const map: Record<UserRole, string> = {
    developer: "text-violet-400",
    admin: "text-amber-400",
    pm: "text-rose-300",
    analyst: "text-sky-400",
  };
  return map[role];
}

function roleBadge(role: UserRole) {
  const map: Record<UserRole, string> = {
    developer: "bg-violet-500/15 text-violet-400",
    admin: "bg-amber-500/15 text-amber-400",
    pm: "bg-rose-500/15 text-rose-300",
    analyst: "bg-sky-500/15 text-sky-400",
  };
  return (
    <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${map[role]}`}>
      {role}
    </span>
  );
}

const ACTION_BTN =
  "flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10";

type Analysis = StoredAnalysis;

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
  const [query, setQuery]             = useState("");
  const [selected, setSelected]       = useState<string | null>(null);
  const [opened, setOpened]           = useState<ResourceWithLinks | null>(null);
  const [editing, setEditing]         = useState<ResourceWithLinks | null>(null);
  const [isPending, startTransition]  = useTransition();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisErr, setAnalysisErr] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages]   = useState<number | null>(null);
  const [zoom, setZoom]               = useState(1);
  const doPrint                       = usePdfPrint(opened?.viewUrl);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter(
      (item) =>
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.uploadedBy.toLowerCase().includes(q),
    );
  }, [resources, query]);

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
      setSelected(item.id);
      setOpened(item);
      setAnalysis(null);
      setAnalysisErr(null);
      if (initialMode === "edit" && canManage(item)) {
        setEditing(item);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialOpenId, resources]);

  function handleCardClick(item: ResourceWithLinks) {
    setAnalysis(null);
    setAnalysisErr(null);
    setCurrentPage(1);
    setTotalPages(null);
    setZoom(1);
    setOpened(item);
    setSelected(item.id);
  }

  async function runAnalysis() {
    if (!opened?.viewUrl) return;
    setAnalysisLoading(true);
    setAnalysisErr(null);
    try {
      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfUrl: opened.viewUrl }),
      });
      const json = (await res.json()) as { ok?: boolean; analysis?: Analysis; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message ?? "Analysis failed");
      setAnalysis(json.analysis ?? null);
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : "Error");
    } finally {
      setAnalysisLoading(false);
    }
  }

  function handleDelete(item: ResourceWithLinks) {
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(async () => {
      await deleteResourceAction(fd);
      if (opened?.id === item.id) setOpened(null);
      setSelected(null);
    });
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="glass-input flex h-[42px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search by title, category, or user"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ResourcesUploadModal />
        <AiChatTrigger />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <section className="panel px-4 py-16 text-center text-sm text-zinc-500">
          {resources.length === 0
            ? "No resources yet. Upload the first one above."
            : "No results match your search."}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const isSelected = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleCardClick(item)}
                className={`panel overflow-hidden rounded-[14px] text-left transition-all focus:outline-none ${
                  isSelected
                    ? "ring-2 ring-white/40 bg-white/[0.10]"
                    : "ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:bg-white/[0.04]"
                }`}
              >
                <div className="p-3 pb-0">
                  <PdfThumbnail url={item.viewUrl} title={item.title} fill />
                </div>
                <div className="px-3 pt-2 pb-2.5 space-y-1">
                  <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                    {item.title}{" "}
                    {item.category ? (
                      <span className="font-normal text-zinc-400">({titleCase(item.category)})</span>
                    ) : null}
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-xs text-zinc-500 truncate">{item.uploadedBy}</span>
                    {roleBadge(item.uploaderRole)}
                  </div>
                  <p className="text-[11px] text-zinc-600">{item.updatedAt}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail panel — opens on double-click */}
      {opened && (
        <div className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-md">
          {/* PDF viewer — left */}
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <PdfViewer
              url={opened.viewUrl}
              scale={zoom}
              onLoadTotalPages={(n) => setTotalPages(n)}
              onPageChange={setCurrentPage}
            />
          </div>

          {/* Side rail — right, always full height */}
          <div className="flex w-[min(380px,100vw)] shrink-0 flex-col p-4 pl-0">
            <div className="panel flex flex-1 flex-col rounded-[16px] overflow-hidden min-h-0">

              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">

                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {opened.category && (
                      <p className="caps-label text-zinc-300">{titleCase(opened.category)}</p>
                    )}
                    <h2 className="mt-0.5 text-base font-semibold text-white leading-snug">
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

                {/* Metadata */}
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Uploaded by</dt>
                    <dd className="font-medium text-white">{opened.uploadedBy}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-zinc-500">Role</dt>
                    <dd className={`font-medium capitalize ${roleColor(opened.uploaderRole)}`}>{opened.uploaderRole}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Date</dt>
                    <dd className="text-zinc-300">{opened.updatedAt}</dd>
                  </div>
                  {totalPages !== null && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Pages</dt>
                      <dd className="tabular-nums text-zinc-300">{currentPage} of {totalPages}</dd>
                    </div>
                  )}
                </dl>

                {/* AI analysis output */}
                {analysisErr ? <p className="text-xs text-rose-400">{analysisErr}</p> : null}
                {analysis ? (
                  <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
                    <p className="caps-label mb-2">AI snapshot</p>
                    <dl className="space-y-1.5">
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 font-medium text-emerald-400">Bull</dt>
                        <dd className="text-zinc-300">{analysis.bull}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 font-medium text-rose-400">Bear</dt>
                        <dd className="text-zinc-300">{analysis.bear}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 font-medium text-zinc-400">Comps</dt>
                        <dd className="text-zinc-300">{analysis.comps.join(", ")}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 font-medium text-zinc-400">Size</dt>
                        <dd className="text-zinc-300">{analysis.sizeRange}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </div>

              {/* Fixed action buttons — always at bottom */}
              <div className="shrink-0 border-t border-white/[0.06] p-5 pt-4 space-y-2">
                {/* Zoom controls */}
                <div className="flex w-full gap-1">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
                    className={ACTION_BTN}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="flex flex-1 items-center justify-center rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm tabular-nums text-zinc-300">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
                    className={ACTION_BTN}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Analyze + Edit details side by side */}
                {(opened.viewUrl || canManage(opened)) && (
                  <div className="flex gap-1">
                    {opened.viewUrl && (
                      <button
                        type="button"
                        disabled={analysisLoading}
                        onClick={() => void runAnalysis()}
                        className={`${ACTION_BTN} flex-1 disabled:opacity-50`}
                      >
                        <Sparkles className="h-4 w-4" />
                        {analysisLoading ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze with AI"}
                      </button>
                    )}
                    {canManage(opened) && (
                      <button
                        type="button"
                        onClick={() => setEditing(opened)}
                        className={`${ACTION_BTN} flex-1`}
                      >
                        Edit details
                      </button>
                    )}
                  </div>
                )}

                {/* Download + Print side by side */}
                <div className="flex gap-1">
                  {opened.downloadEnabled && opened.downloadUrl ? (
                    <Link href={opened.downloadUrl} className={`${ACTION_BTN} flex-1`}>
                      <Download className="h-4 w-4" />
                      Download
                    </Link>
                  ) : (
                    <div className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-[10px] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-600">
                      <Download className="h-4 w-4" />
                      Download
                    </div>
                  )}
                  <button type="button" onClick={() => doPrint()} className={`${ACTION_BTN} flex-1`}>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
          <div className="w-full max-w-sm rounded-[12px] border border-white/[0.08] bg-black/85 backdrop-blur-md p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Resources</p>
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
              <select
                name="category"
                defaultValue={editing.category}
                className="glass-input w-full bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none"
              >
                <option value="training">Training</option>
                <option value="pitch">Pitch</option>
                <option value="playbook">Playbook</option>
                <option value="research">Research</option>
              </select>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/10"
                  onClick={() =>
                    setEditing((prev) => prev ? { ...prev, downloadEnabled: !prev.downloadEnabled } : prev)
                  }
                >
                  {editing.downloadEnabled ? "Downloadable" : "View only"}
                </button>
                <input type="hidden" name="downloadEnabled" value={String(editing.downloadEnabled)} />
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
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a80705] disabled:opacity-50"
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
