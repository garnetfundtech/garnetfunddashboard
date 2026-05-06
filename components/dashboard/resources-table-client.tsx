"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { ResourceWithLinks } from "@/lib/data";

export function ResourcesTableClient({
  resources,
}: {
  resources: ResourceWithLinks[];
}) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const filtered = useMemo(
    () =>
      resources.filter((item) => {
        const matchesQuery = item.title.toLowerCase().includes(query.trim().toLowerCase());
        const matchesCategory = !category || item.category === category;
        return matchesQuery && matchesCategory;
      }),
    [resources, query, category],
  );

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="glass-input flex flex-1 items-center gap-2 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search resources..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          className="glass-input bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          <option value="training">Training</option>
          <option value="pitch">Pitch</option>
          <option value="playbook">Playbook</option>
          <option value="research">Research</option>
        </select>
      </div>

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-left font-medium">Updated</th>
              <th className="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No resources yet. Upload the first one above.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3 text-white">{item.title}</td>
                  <td className="px-4 py-3 capitalize text-zinc-300">{item.category}</td>
                  <td className="px-4 py-3 text-zinc-400">{item.updatedAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 text-xs">
                      {item.viewUrl ? (
                        <button
                          onClick={() => setSelectedUrl(item.viewUrl ?? null)}
                          className="text-[#d88f8d] hover:underline"
                        >
                          View
                        </button>
                      ) : (
                        <span className="text-zinc-500">No preview</span>
                      )}
                      {item.downloadEnabled && item.downloadUrl ? (
                        <Link href={item.downloadUrl} className="text-emerald-300 hover:underline">
                          Download
                        </Link>
                      ) : (
                        <span className="text-zinc-500">View only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {selectedUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel h-[80vh] w-full max-w-5xl p-2">
            <div className="mb-2 flex items-center justify-end">
              <button
                className="rounded-[10px] bg-[#8e0604] px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => setSelectedUrl(null)}
              >
                Close
              </button>
            </div>
            <iframe src={selectedUrl} className="h-[calc(80vh-52px)] w-full rounded-[10px]" />
          </div>
        </div>
      ) : null}
    </>
  );
}
