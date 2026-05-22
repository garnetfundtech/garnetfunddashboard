"use client";

import { useState } from "react";
import { BookOpen, TrendingUp } from "lucide-react";
import { PdfThumbnail } from "@/components/dashboard/pdf-thumbnail";
import { PdfViewer } from "@/components/dashboard/pdf-viewer";
import { X } from "lucide-react";
import type { ResearchItem, LivePosition } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function CoveragePageClient({
  analystName,
  coverageSector,
  myResearch,
  sectorPositions,
  sectorQuotes,
}: {
  analystName: string;
  coverageSector: string | null;
  myResearch: ResearchItem[];
  sectorPositions: LivePosition[];
  sectorQuotes: Record<string, { price: number; changePct: number }>;
}) {
  const [openedResearch, setOpenedResearch] = useState<ResearchItem | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel p-5">
        <p className="caps-label mb-1">Coverage</p>
        <h1 className="page-title">{analystName}</h1>
        {coverageSector ? (
          <p className="mt-1 text-sm text-zinc-400">
            Sector: <span className="font-medium text-white">{coverageSector}</span>
          </p>
        ) : (
          <p className="mt-2 rounded-[8px] bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            Your coverage sector has not been assigned yet. Contact an admin.
          </p>
        )}
      </div>

      {/* Sector holdings */}
      {coverageSector && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            <p className="caps-label">Fund Holdings — {coverageSector}</p>
          </div>
          {sectorPositions.length === 0 ? (
            <p className="text-sm text-zinc-500">No current fund positions in this sector.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">Ticker</th>
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium text-right">Price</th>
                    <th className="pb-2 pr-4 font-medium text-right">Day %</th>
                    <th className="pb-2 font-medium text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorPositions.map((p) => {
                    const q = sectorQuotes[p.ticker];
                    const price = q?.price ?? p.currentPrice;
                    const changePct = q?.changePct ?? p.dayPnlPct;
                    return (
                      <tr key={p.ticker} className="border-b border-white/[0.03]">
                        <td className="py-2 pr-4 font-medium text-white">{p.ticker}</td>
                        <td className="py-2 pr-4 text-zinc-400">{p.name}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-zinc-200">
                          ${price.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "py-2 pr-4 text-right tabular-nums",
                            changePct >= 0 ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {fmtPct(changePct)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-zinc-400">
                          {p.weight.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* My research */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-zinc-400" />
          <p className="caps-label">My Research ({myResearch.length})</p>
        </div>
        {myResearch.length === 0 ? (
          <div className="panel px-4 py-12 text-center text-sm text-zinc-500">
            You have not uploaded any research yet. Go to the Research tab to upload.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {myResearch.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOpenedResearch(item)}
                className="panel overflow-hidden rounded-[14px] text-left transition-all ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:bg-white/[0.04] focus:outline-none"
              >
                <div className="p-3 pb-0">
                  <PdfThumbnail url={item.viewUrl} title={item.title} fill />
                </div>
                <div className="space-y-1 px-3 pt-2 pb-2.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
                    {item.title}{" "}
                    {item.ticker && item.ticker !== "—" ? (
                      <span className="font-normal text-zinc-400">({item.ticker.toUpperCase()})</span>
                    ) : null}
                  </p>
                  {item.sector && (
                    <p className="text-[11px] text-zinc-500">{item.sector}</p>
                  )}
                  <p className="text-[11px] text-zinc-600">{item.updatedAt}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* PDF viewer modal */}
      {openedResearch && (
        <div className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <PdfViewer url={openedResearch.viewUrl} />
          </div>
          <div className="flex w-[min(320px,100vw)] shrink-0 flex-col p-4 pl-0">
            <div className="panel flex flex-col rounded-[16px] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  {openedResearch.ticker && openedResearch.ticker !== "—" && (
                    <p className="caps-label">{openedResearch.ticker.toUpperCase()}</p>
                  )}
                  <h2 className="mt-0.5 text-sm font-semibold text-white">{openedResearch.title}</h2>
                </div>
                <button
                  onClick={() => setOpenedResearch(null)}
                  className="shrink-0 rounded-[8px] p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <dl className="space-y-2 text-sm">
                {openedResearch.sector && (
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Sector</dt>
                    <dd className="text-zinc-200">{openedResearch.sector}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Date</dt>
                  <dd className="text-zinc-300">{openedResearch.updatedAt}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
