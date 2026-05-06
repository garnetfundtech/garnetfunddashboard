"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Download, Search, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { PdfThumbnail } from "@/components/dashboard/pdf-thumbnail";
import { ResearchUploadModal } from "@/components/dashboard/research-upload-modal";
import type { ResearchItem, ThesisStatus, UserRole } from "@/lib/types";
import { canManageContent } from "@/lib/roles";
import { deleteResearchAction, updateResearchAction } from "@/app/(dashboard)/research/actions";

function roleBadge(role: UserRole) {
  const map: Record<UserRole, string> = {
    developer: "bg-violet-500/15 text-violet-400",
    admin: "bg-amber-500/15 text-amber-400",
    pm: "bg-rose-500/15 text-rose-300",
    analyst: "bg-sky-500/15 text-sky-400",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${map[role]}`}>
      {role}
    </span>
  );
}

function thesisLabel(s: ThesisStatus) {
  const m: Record<ThesisStatus, string> = {
    active: "Active",
    under_review: "Under Review",
    became_position: "Became Position",
    rejected: "Rejected",
  };
  return m[s] ?? s;
}

type Analysis = {
  bullThesis: string;
  bearThesis: string;
  keyRisks: string[];
  comparables: string[];
  positionSizeRange: string;
};

export function ResearchTableClient({
  items,
  actor,
  initialQuery = "",
  holdTickers,
}: {
  items: ResearchItem[];
  actor: { id: string; role: UserRole };
  initialQuery?: string;
  holdTickers: Set<string>;
}) {
  const [query, setQuery] = useState(() => initialQuery);
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<ResearchItem | null>(null);
  const [editing, setEditing] = useState<ResearchItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisErr, setAnalysisErr] = useState<string | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.ticker.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        (item.sector ?? "").toLowerCase().includes(q) ||
        (item.analystName ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  function handleCardClick(item: ResearchItem) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      setAnalysis(null);
      setAnalysisErr(null);
      setOpened(item);
      setSelected(item.id);
    } else {
      clickTimer.current = setTimeout(() => {
        setSelected((prev) => (prev === item.id ? null : item.id));
        clickTimer.current = null;
      }, 220);
    }
  }

  function handleDelete(item: ResearchItem) {
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(async () => {
      await deleteResearchAction(fd);
      if (opened?.id === item.id) setOpened(null);
      setSelected(null);
    });
  }

  const canManage = (item: ResearchItem) =>
    canManageContent({
      actorId: actor.id,
      actorRole: actor.role,
      ownerId: item.createdBy,
      ownerRole: item.uploaderRole,
    });

  async function runAnalysis() {
    if (!opened?.viewUrl) return;
    setAnalysisLoading(true);
    setAnalysisErr(null);
    try {
      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfUrl: opened.viewUrl }),
      });
      const json = (await res.json()) as { ok?: boolean; analysis?: Analysis; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message ?? "Analysis failed");
      setAnalysis(json.analysis ?? null);
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : "Error");
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="glass-input flex h-[42px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search by title, ticker, sector, or analyst"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ResearchUploadModal />
      </div>

      {filtered.length === 0 ? (
        <section className="panel px-4 py-16 text-center text-sm text-zinc-500">
          {items.length === 0
            ? "No research reports yet. Upload the first one above."
            : "No results match your search."}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const isSelected = selected === item.id;
            const sym = item.ticker.replace(/—/g, "").trim().toUpperCase();
            const live =
              item.thesisStatus === "became_position" && sym.length > 0 && holdTickers.has(sym);
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
                <div className="space-y-1 px-3 pt-2.5 pb-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{item.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-medium text-zinc-400">{item.ticker}</p>
                    {item.sector ? (
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-300">
                        {item.sector}
                      </span>
                    ) : null}
                    {live ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        Live position
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-zinc-500">{thesisLabel(item.thesisStatus)}</p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="truncate text-xs text-zinc-500">
                      {item.analystName ?? item.author}
                    </span>
                    {roleBadge(item.uploaderRole)}
                  </div>
                  <p className="text-[11px] text-zinc-600">{item.updatedAt}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {opened && (
        <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm">
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <div className="panel flex h-full flex-col overflow-hidden rounded-[16px] p-0">
              <iframe src={opened.viewUrl} className="min-h-0 flex-1 rounded-[16px]" title={opened.title} />
            </div>
          </div>

          <div className="flex w-[min(380px,100vw)] shrink-0 flex-col gap-3 overflow-y-auto p-4 pl-0">
            <div className="panel flex flex-col gap-4 rounded-[16px] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="caps-label">Research</p>
                  <h2 className="mt-0.5 text-base font-semibold leading-snug text-white">{opened.title}</h2>
                </div>
                <button
                  onClick={() => setOpened(null)}
                  className="mt-0.5 shrink-0 rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Ticker</dt>
                  <dd className="font-medium text-white">{opened.ticker}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Sector</dt>
                  <dd className="text-zinc-200">{opened.sector ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Thesis status</dt>
                  <dd className="text-zinc-200">{thesisLabel(opened.thesisStatus)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Analyst</dt>
                  <dd className="font-medium text-white">{opened.analystName ?? opened.author}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Role</dt>
                  <dd>{roleBadge(opened.uploaderRole)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Date</dt>
                  <dd className="text-zinc-300">{opened.updatedAt}</dd>
                </div>
              </dl>

              <div className="border-t border-white/[0.06]" />

              {opened.viewUrl ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={analysisLoading}
                    onClick={() => void runAnalysis()}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#a80705] disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    {analysisLoading ? "Analyzing…" : "Analyze with AI"}
                  </button>
                  {analysisErr ? <p className="text-xs text-rose-400">{analysisErr}</p> : null}
                  {analysis ? (
                    <div className="space-y-2 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-zinc-200">
                      <p className="caps-label">AI output</p>
                      <div>
                        <p className="font-semibold text-emerald-300/90">Bull</p>
                        <p className="mt-0.5 text-zinc-300">{analysis.bullThesis}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-rose-300/90">Bear</p>
                        <p className="mt-0.5 text-zinc-300">{analysis.bearThesis}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-400">Risks</p>
                        <ul className="mt-0.5 list-disc pl-4 text-zinc-400">
                          {analysis.keyRisks.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-400">Comps</p>
                        <p className="mt-0.5 text-zinc-300">{analysis.comparables.join(", ")}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-400">Size range</p>
                        <p className="mt-0.5 text-zinc-300">{analysis.positionSizeRange}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

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
                  <div className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-[10px] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-600">
                    <Download className="h-4 w-4" />
                    Download disabled
                  </div>
                )}

                {canManage(opened) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(opened);
                    }}
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

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
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
                  await updateResearchAction(fd);
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
              <input
                name="ticker"
                defaultValue={editing.ticker === "—" ? "" : editing.ticker}
                className="glass-input w-full px-3 py-2.5 text-sm uppercase text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Ticker"
              />
              <input
                name="sector"
                defaultValue={editing.sector ?? ""}
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Sector tag"
              />
              <input
                name="analystName"
                defaultValue={editing.analystName ?? ""}
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder="Analyst name"
              />
              <select
                name="thesisStatus"
                defaultValue={editing.thesisStatus}
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none"
              >
                <option value="active">Active</option>
                <option value="under_review">Under Review</option>
                <option value="became_position">Became Position</option>
                <option value="rejected">Rejected</option>
              </select>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/10"
                  onClick={() =>
                    setEditing((prev) => (prev ? { ...prev, downloadEnabled: !prev.downloadEnabled } : prev))
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
