"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Highlight } from "@/components/dashboard/highlight";
import { PdfControls } from "@/components/dashboard/pdf-controls";
import { ResourcesUploadModal } from "@/components/dashboard/resources-upload-modal";
import type { ResourceWithLinks } from "@/lib/data";
import type { UserRole } from "@/lib/types";
import { canManageContent } from "@/lib/roles";
import { deleteResourceAction, updateResourceAction } from "@/app/(dashboard)/resources/actions";

export function ResourcesTableClient({
  resources,
  actor,
}: {
  resources: ResourceWithLinks[];
  actor: { id: string; role: UserRole };
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editing, setEditing] = useState<ResourceWithLinks | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((item) => {
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.uploadedBy.toLowerCase().includes(q);
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [resources, query, categoryFilter]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="glass-input flex h-[42px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search resources by title, category, or user"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="glass-input h-[42px] bg-transparent px-3 text-sm text-zinc-300 outline-none"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          <option value="training">Training</option>
          <option value="pitch">Pitch</option>
          <option value="playbook">Playbook</option>
          <option value="research">Research</option>
        </select>
        <ResourcesUploadModal />
      </div>

      {/* Table */}
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-left font-medium">Uploaded by</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Controls</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                  {resources.length === 0
                    ? "No resources yet. Upload the first one above."
                    : "No results match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.title} query={query} />
                  </td>
                  <td className="px-4 py-3 capitalize text-white">
                    <Highlight text={item.category} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">
                    <Highlight text={item.uploadedBy} query={query} />
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
                          await deleteResourceAction(fd);
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
                <p className="caps-label">Resources</p>
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
                  await updateResourceAction(fd);
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
