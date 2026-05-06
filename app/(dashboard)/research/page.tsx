import Link from "next/link";
import { Ban } from "lucide-react";
import { Search } from "lucide-react";
import { getResearchItems } from "@/lib/data";
import { ResearchUploadModal } from "@/components/dashboard/research-upload-modal";

const confidenceColor: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-zinc-400",
};

export default async function ResearchPage() {
  const researchItems = await getResearchItems();

  return (
    <div className="space-y-3 pt-2">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Research</h1>
        <ResearchUploadModal />
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3">
        <div className="glass-input flex flex-1 items-center gap-2 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search research..."
          />
        </div>
        <select className="glass-input bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none">
          <option value="">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="glass-input bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none">
          <option value="">All tickers</option>
        </select>
      </div>

      {/* Table */}
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Ticker</th>
              <th className="px-4 py-2 text-left font-medium">Author</th>
              <th className="px-4 py-2 text-left font-medium">Confidence</th>
              <th className="px-4 py-2 text-left font-medium">Uploaded</th>
              <th className="px-4 py-2 text-left font-medium">File</th>
            </tr>
          </thead>
          <tbody>
            {researchItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No research reports yet. Upload the first one above.
                </td>
              </tr>
            ) : (
              researchItems.map((item) => (
                <tr key={item.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3 text-white">{item.title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300">{item.ticker}</td>
                  <td className="px-4 py-3 text-zinc-300">{item.author}</td>
                  <td className={`px-4 py-3 capitalize font-medium ${confidenceColor[item.confidence] ?? "text-zinc-400"}`}>
                    {item.confidence}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{item.updatedAt}</td>
                  <td className="px-4 py-3">
                    {item.downloadEnabled && item.downloadUrl ? (
                      <Link
                        href={item.downloadUrl}
                        className="text-xs text-[#d88f8d] hover:underline"
                      >
                        Download
                      </Link>
                    ) : (
                      <Ban className="h-4 w-4 text-zinc-600" />
                    )}
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
