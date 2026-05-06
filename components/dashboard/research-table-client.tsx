"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Highlight } from "@/components/dashboard/highlight";
import { PdfControls } from "@/components/dashboard/pdf-controls";
import { PdfThumbnail } from "@/components/dashboard/pdf-thumbnail";
import { ResearchUploadModal } from "@/components/dashboard/research-upload-modal";
import type { ResearchItem } from "@/lib/types";
import type { UserRole } from "@/lib/types";
import { canManageContent } from "@/lib/roles";
import { deleteResearchAction, updateResearchAction } from "@/app/(dashboard)/research/actions";

export function ResearchTableClient({
  items,
  actor,
}: {
  items: ResearchItem[];
  actor: { id: string; role: UserRole };
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ResearchItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.ticker.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q);
      return matchesQuery;
    });
  }, [items, query]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="glass-input flex h-[42px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search research by title, ticker, or user"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ResearchUploadModal />
      </div>

      {/* Table */}
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">File</th>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Ticker</th>
              <th className="px-4 py-2 text-left font-medium">Uploaded by</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Controls</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                  {items.length === 0
                    ? "No research reports yet. Upload the first one above."
                    : "No results match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3">
                    <PdfThumbnail url={item.viewUrl} title={item.title} />
                  </td>
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.title} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.ticker} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.author} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">{item.updatedAt}</td>
                  <td className="px-4 py-3">
                    <PdfControls
                      title={item.title}
                      viewUrl={item.viewUrl}
                      downloadUrl={item.downloadEnabled ? item.downloadUrl : undefined}
                      canEdit={canManageContent({
                        actorId: actor.id,
                        actorRole: actor.role,
                        ownerId: item.createdBy,
                        ownerRole: item.uploaderRole,
                      })}
                      canDelete={canManageContent({
                        actorId: actor.id,
                        actorRole: actor.role,
                        ownerId: item.createdBy,
                        ownerRole: item.uploaderRole,
                      })}
                      onEdit={() => setEditing(item)}
                      onDelete={() => {
                        const fd = new FormData();
                        fd.set("id", item.id);
                        startTransition(async () => {
                          await deleteResearchAction(fd);
                        });
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
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
                ×
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
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a80705] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
