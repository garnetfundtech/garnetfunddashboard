"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Highlight } from "@/components/dashboard/highlight";
import { PdfControls } from "@/components/dashboard/pdf-controls";
import { ResourcesUploadModal } from "@/components/dashboard/resources-upload-modal";
import type { ResourceWithLinks } from "@/lib/data";

export function ResourcesTableClient({ resources }: { resources: ResourceWithLinks[] }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

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
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
