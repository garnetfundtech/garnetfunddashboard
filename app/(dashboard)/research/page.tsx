import Link from "next/link";
import { Ban, Download, Search } from "lucide-react";
import { getResearchItems } from "@/lib/data";
import { ResearchUploadModal } from "@/components/dashboard/research-upload-modal";

export default async function ResearchPage() {
  const researchItems = await getResearchItems();

  return (
    <div className="space-y-3 pt-2">
      {/* Search + upload */}
      <div className="flex items-center gap-3">
        <div className="glass-input flex flex-1 items-center gap-2 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search research..."
          />
        </div>
        <select className="glass-input bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none">
          <option value="">All tickers</option>
          {[...new Set(researchItems.map((i) => i.ticker).filter((t) => t !== "—"))].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <ResearchUploadModal />
      </div>

      {/* Table */}
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Ticker</th>
              <th className="px-4 py-2 text-left font-medium">Uploaded by</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">File</th>
            </tr>
          </thead>
          <tbody>
            {researchItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No research reports yet. Upload the first one above.
                </td>
              </tr>
            ) : (
              researchItems.map((item) => (
                <tr key={item.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3 text-white">{item.title}</td>
                  <td className="px-4 py-3 text-zinc-300">{item.ticker}</td>
                  <td className="px-4 py-3 text-zinc-400">{item.author}</td>
                  <td className="px-4 py-3 text-zinc-400">{item.updatedAt}</td>
                  <td className="px-4 py-3">
                    {item.downloadEnabled && item.downloadUrl ? (
                      <Link
                        href={item.downloadUrl}
                        className="inline-flex items-center justify-center rounded-[7px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Link>
                    ) : (
                      <Ban className="h-4 w-4 text-zinc-700" />
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
