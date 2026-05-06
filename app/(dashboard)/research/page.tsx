import Link from "next/link";
import { FilePlus2, Search } from "lucide-react";
import { uploadResearchAction } from "@/app/(dashboard)/research/actions";
import { getResearchItems } from "@/lib/data";

export default async function ResearchPage() {
  const researchItems = await getResearchItems();

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Research</h1>
        <form action={uploadResearchAction} className="flex items-center gap-2">
          <input name="title" placeholder="Title" className="glass-input px-3 py-2 text-sm outline-none" required />
          <input name="ticker" placeholder="Ticker" className="glass-input w-24 px-3 py-2 text-sm outline-none" />
          <select name="confidence" className="glass-input px-3 py-2 text-sm outline-none">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input name="file" type="file" accept="application/pdf" className="glass-input px-2 py-2 text-xs" required />
          <button className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white">
            <FilePlus2 className="h-4 w-4" />
            Upload
          </button>
        </form>
      </div>

      <div className="flex items-center gap-2">
        <div className="glass-input flex w-full max-w-md items-center gap-2 px-3 py-2.5">
          <Search className="h-4 w-4 text-zinc-500" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="Search research..." />
        </div>
        <select className="glass-input px-3 py-2 text-sm outline-none">
          <option>All confidence</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select className="glass-input px-3 py-2 text-sm outline-none">
          <option>All tickers</option>
        </select>
      </div>

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Ticker</th>
              <th className="px-4 py-2 text-left font-medium">Author</th>
              <th className="px-4 py-2 text-left font-medium">Confidence</th>
              <th className="px-4 py-2 text-left font-medium">Updated</th>
              <th className="px-4 py-2 text-left font-medium">File</th>
            </tr>
          </thead>
          <tbody>
            {researchItems.map((item) => (
              <tr key={item.id} className="odd:bg-white/[0.015]">
                <td className="px-4 py-3 text-white">{item.title}</td>
                <td className="px-4 py-3 text-zinc-300">{item.ticker}</td>
                <td className="px-4 py-3 text-zinc-300">{item.author}</td>
                <td className="px-4 py-3 text-zinc-300 capitalize">{item.confidence}</td>
                <td className="px-4 py-3 text-zinc-400">{item.updatedAt}</td>
                <td className="px-4 py-3">
                  {item.viewUrl ? (
                    <Link href={item.viewUrl} target="_blank" className="text-[#d88f8d] hover:underline">
                      View
                    </Link>
                  ) : (
                    <span className="text-zinc-500">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
