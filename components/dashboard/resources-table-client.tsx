"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Download, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { PdfThumbnail } from "@/components/dashboard/pdf-thumbnail";
import { ResourcesUploadModal } from "@/components/dashboard/resources-upload-modal";
import type { ResourceWithLinks } from "@/lib/data";
import type { UserRole } from "@/lib/types";
import { canManageContent } from "@/lib/roles";
import { deleteResourceAction, updateResourceAction } from "@/app/(dashboard)/resources/actions";

const CATEGORY_COLORS: Record<string, string> = {
  training:  "bg-sky-500/15 text-sky-400",
  pitch:     "bg-violet-500/15 text-violet-400",
  playbook:  "bg-amber-500/15 text-amber-400",
  research:  "bg-emerald-500/15 text-emerald-400",
};

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? "bg-zinc-500/15 text-zinc-400";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${cls}`}>
      {category}
    </span>
  );
}

export function ResourcesTableClient({
  resources,
  actor,
}: {
  resources: ResourceWithLinks[];
  actor: { id: string; role: UserRole };
}) {
  const [query, setQuery]             = useState("");
  const [selected, setSelected]       = useState<string | null>(null);
  const [opened, setOpened]           = useState<ResourceWithLinks | null>(null);
  const [editing, setEditing]         = useState<ResourceWithLinks | null>(null);
  const [isPending, startTransition]  = useTransition();
  const clickTimer                    = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleCardClick(item: ResourceWithLinks) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      setOpened(item);
      setSelected(item.id);
    } else {
      clickTimer.current = setTimeout(() => {
        setSelected((prev) => (prev === item.id ? null : item.id));
        clickTimer.current = null;
      }, 220);
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

  const canManage = (item: ResourceWithLinks) =>
    canManageContent({
      actorId: actor.id,
      actorRole: actor.role,
      ownerId: item.createdBy,
      ownerRole: item.uploaderRole,
    });

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
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <section className="panel px-4 py-16 text-center text-sm text-zinc-500">
          {resources.length === 0
            ? "No resources yet. Upload the first one above."
            : "No results match your search."}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const isSelected = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleCardClick(item)}
                className={`panel text-left overflow-hidden rounded-[14px] transition-all focus:outline-none ${
                  isSelected
                    ? "ring-2 ring-white/20 bg-white/[0.04]"
                    : "ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:bg-white/[0.025]"
                }`}
              >
                <PdfThumbnail url={item.viewUrl} title={item.title} fill />
                <div className="px-3 pt-2.5 pb-3 space-y-1">
                  <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <CategoryBadge category={item.category} />
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-xs text-zinc-500 truncate">{item.uploadedBy}</span>
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
        <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm">
          {/* File viewer — 2/3 width */}
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <div className="panel flex h-full flex-col overflow-hidden rounded-[16px] p-0">
              <iframe
                src={opened.viewUrl}
                className="min-h-0 flex-1 rounded-[16px]"
                title={opened.title}
              />
            </div>
          </div>

          {/* Controls — 1/3 width */}
          <div className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto p-4 pl-0">
            <div className="panel flex flex-col gap-4 rounded-[16px] p-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="caps-label">Resources</p>
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
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Category</dt>
                  <dd><CategoryBadge category={opened.category} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Uploaded by</dt>
                  <dd className="font-medium text-white">{opened.uploadedBy}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Date</dt>
                  <dd className="text-zinc-300">{opened.updatedAt}</dd>
                </div>
              </dl>

              <div className="border-t border-white/[0.06]" />

              {/* Actions */}
              <div className="space-y-2">
                {opened.downloadEnabled && opened.downloadUrl ? (
                  <Link
                    href={opened.downloadUrl}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Link>
                ) : (
                  <div className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-600 cursor-not-allowed">
                    <Download className="h-4 w-4" />
                    Download disabled
                  </div>
                )}

                {canManage(opened) && (
                  <button
                    type="button"
                    onClick={() => setEditing(opened)}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    Edit details
                  </button>
                )}

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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
          <div className="panel w-full max-w-sm p-6">
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
