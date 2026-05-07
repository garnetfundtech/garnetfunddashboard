"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AiChatTrigger } from "@/components/dashboard/ai-chat-panel";
import type { PitchRow, PitchStage, UserRole } from "@/lib/types";
import {
  createPitchAction,
  deletePitchAction,
  updatePitchAction,
  updatePitchStageAction,
} from "@/app/(dashboard)/pipeline/actions";

const STAGES: PitchStage[] = ["idea", "in_research", "pitched", "voted", "position", "rejected"];

const LABELS: Record<PitchStage, string> = {
  idea: "Idea",
  in_research: "In Research",
  pitched: "Pitched",
  voted: "Voted",
  position: "Position",
  rejected: "Rejected",
};

function canSetTerminal(role: UserRole) {
  return role === "pm" || role === "admin" || role === "developer";
}

export function PipelineBoardClient({
  pitches,
  actor,
  researchOptions,
}: {
  pitches: PitchRow[];
  actor: { id: string; role: UserRole };
  researchOptions: { id: string; title: string; ticker: string | null; viewUrl: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PitchRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const researchById = useMemo(() => {
    const m = new Map<string, { title: string; ticker: string | null; viewUrl: string | null }>();
    for (const r of researchOptions) m.set(r.id, { title: r.title, ticker: r.ticker, viewUrl: r.viewUrl });
    return m;
  }, [researchOptions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pitches;
    return pitches.filter((p) => {
      const linked = p.researchId ? researchById.get(p.researchId) : null;
      const hay = [
        p.ticker,
        p.thesis,
        p.analystName,
        LABELS[p.stage],
        linked?.title ?? "",
        linked?.ticker ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pitches, query, researchById]);

  function move(p: PitchRow, stage: PitchStage) {
    if ((stage === "position" || stage === "rejected") && !canSetTerminal(actor.role)) return;
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("stage", stage);
    startTransition(async () => {
      await updatePitchStageAction(fd);
      router.refresh();
    });
  }

  function canMovePitch(p: PitchRow, stage: PitchStage) {
    if ((stage === "position" || stage === "rejected") && !canSetTerminal(actor.role)) return false;
    if (p.analystId !== actor.id && !canSetTerminal(actor.role)) return false;
    return true;
  }

  function canManagePitch(p: PitchRow) {
    return p.analystId === actor.id || canSetTerminal(actor.role);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass-input flex h-[42px] min-w-[240px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pitches by ticker, thesis, analyst, stage…"
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-[42px] items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 text-xs font-medium text-white hover:bg-[#a80705]"
        >
          <Plus className="h-3.5 w-3.5" />
          New Pitch
        </button>
        <AiChatTrigger />
      </div>

      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {STAGES.map((stage) => (
          <div key={stage} className="panel flex min-w-[200px] max-w-[240px] flex-1 flex-col p-2">
            <p className="caps-label text-[10px]">{LABELS[stage]}</p>
            <div className="mt-2 flex-1 space-y-2">
              {visible
                .filter((p) => p.stage === stage)
                .map((p) => (
                  <div
                    key={p.id}
                    className="relative rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-white">{p.ticker}</p>
                      <div className="flex items-center gap-1">
                        {canManagePitch(p) ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => setEditing(p)}
                            className="rounded-[6px] bg-white/[0.04] p-1 text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                            aria-label="Edit pitch"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {canManagePitch(p) ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("id", p.id);
                              startTransition(async () => {
                                try {
                                  await deletePitchAction(fd);
                                  router.refresh();
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : "Could not delete pitch.");
                                }
                              });
                            }}
                            className="rounded-[6px] bg-rose-500/10 p-1 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                            aria-label="Delete pitch"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {(() => {
                          const idx = STAGES.indexOf(p.stage);
                          const prev = idx > 0 ? STAGES[idx - 1] : null;
                          const next = idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
                          return (
                            <>
                              {prev && canMovePitch(p, prev) ? (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => move(p, prev)}
                                  className="rounded-[6px] bg-white/[0.04] p-1 text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                                  aria-label="Move left"
                                >
                                  <ArrowLeft className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              {next && canMovePitch(p, next) ? (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => move(p, next)}
                                  className="rounded-[6px] bg-white/[0.04] p-1 text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                                  aria-label="Move right"
                                >
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-zinc-400">{p.thesis || "—"}</p>
                    <p className="mt-1 text-[10px] text-zinc-600">{p.analystName}</p>
                    <p className="text-[10px] text-zinc-600">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </p>

                    {p.researchId ? (
                      <div className="mt-2 border-t border-white/[0.05] pt-2">
                        {(() => {
                          const r = researchById.get(p.researchId!);
                          const label = r?.title ?? "Research";
                          const href = r?.viewUrl ? r.viewUrl : `/research?q=${encodeURIComponent(p.ticker)}`;
                          return (
                            <Link
                              href={href}
                              target={r?.viewUrl ? "_blank" : undefined}
                              rel={r?.viewUrl ? "noreferrer" : undefined}
                              className="inline-flex items-center gap-1 text-[10px] text-[#f4c5c4] hover:text-white"
                            >
                              <BookOpen className="h-3 w-3" />
                              {label}
                            </Link>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-[12px] border border-white/[0.08] bg-black/85 backdrop-blur-md p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">New pitch</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
                ✕
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(async () => {
                  await createPitchAction(fd);
                  router.refresh();
                  setOpen(false);
                });
              }}
            >
              <input
                name="ticker"
                required
                placeholder="Ticker"
                className="glass-input w-full px-3 py-2 text-sm uppercase outline-none"
              />
              <textarea
                name="thesis"
                required
                rows={3}
                placeholder="One-line thesis"
                className="glass-input w-full px-3 py-2 text-sm outline-none"
              />
              <select name="researchId" className="glass-input w-full px-3 py-2 text-sm text-zinc-200">
                <option value="">Link research (optional)</option>
                {researchOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} {r.ticker ? `(${r.ticker})` : ""}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-[8px] px-3 py-2 text-xs text-zinc-400 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-[8px] bg-[#8e0604] px-3 py-2 text-xs font-medium text-white hover:bg-[#a80705]"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-[12px] border border-white/[0.08] bg-black/85 backdrop-blur-md p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Edit pitch</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-zinc-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!editing) return;
                const fd = new FormData(e.currentTarget);
                fd.set("id", editing.id);
                startTransition(async () => {
                  await updatePitchAction(fd);
                  router.refresh();
                  setEditing(null);
                });
              }}
            >
              <input
                name="ticker"
                required
                defaultValue={editing.ticker}
                placeholder="Ticker"
                className="glass-input w-full px-3 py-2 text-sm uppercase outline-none"
              />
              <textarea
                name="thesis"
                required
                rows={3}
                defaultValue={editing.thesis}
                placeholder="One-line thesis"
                className="glass-input w-full px-3 py-2 text-sm outline-none"
              />
              <select
                name="researchId"
                defaultValue={editing.researchId ?? ""}
                className="glass-input w-full px-3 py-2 text-sm text-zinc-200"
              >
                <option value="">Link research (optional)</option>
                {researchOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-[8px] px-3 py-2 text-xs text-zinc-400 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-[8px] bg-[#8e0604] px-3 py-2 text-xs font-medium text-white hover:bg-[#a80705] disabled:opacity-50"
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
