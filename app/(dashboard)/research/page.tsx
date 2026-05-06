import Link from "next/link";
import { FilePlus2, Tag } from "lucide-react";
import { uploadResearchAction } from "@/app/(dashboard)/research/actions";
import { getResearchItems } from "@/lib/data";

export default async function ResearchPage() {
  const researchItems = await getResearchItems();

  return (
    <div className="space-y-3">
      <section className="panel p-4">
        <div>
          <p className="caps-label">Research Hub</p>
          <h1 className="text-lg font-semibold text-white">Ticker-Tagged Research Library</h1>
          <p className="text-sm text-zinc-400">
            Upload reports, attach tickers, and maintain long-term thesis history.
          </p>
        </div>
        <form action={uploadResearchAction} className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            name="title"
            placeholder="Report title"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none md:col-span-2"
            required
          />
          <input
            name="ticker"
            placeholder="Ticker (AAPL)"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none"
          />
          <select
            name="confidence"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none"
          >
            <option value="high">High confidence</option>
            <option value="medium">Medium confidence</option>
            <option value="low">Low confidence</option>
          </select>
          <input
            name="file"
            type="file"
            accept="application/pdf"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-2 text-xs outline-none"
            required
          />
          <button className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white md:col-span-5">
            <FilePlus2 className="h-4 w-4" />
            Upload Research PDF
          </button>
        </form>
      </section>

      <section className="panel p-2">
        {researchItems.map((item) => (
          <article
            key={item.id}
            className="flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-3 not-last:mb-2"
          >
            <div>
              <p className="font-medium text-white">{item.title}</p>
              <p className="text-sm text-zinc-400">
                {item.author} · Updated {item.updatedAt}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
                <Tag className="h-3 w-3" />
                {item.ticker}
              </span>
              <span className="text-zinc-400">Confidence: {item.confidence}</span>
              {item.viewUrl ? (
                <Link href={item.viewUrl} target="_blank" className="text-[#d88f8d] hover:underline">
                  View PDF
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
