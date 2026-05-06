"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import type { PitchRow, PitchStage, UserRole } from "@/lib/types";
import { createPitchAction, updatePitchStageAction } from "@/app/(dashboard)/pipeline/actions";

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
  researchOptions: { id: string; title: string; ticker: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function move(p: PitchRow, stage: PitchStage) {
    if ((stage === "position" || stage === "rejected") && !canSetTerminal(actor.role)) return;
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("stage", stage);
    startTransition(async () => {
      await updatePitchStageAction(fd);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2 text-xs font-medium text-white hover:bg-[#a80705]"
        >
          <Plus className="h-3.5 w-3.5" />
          New pitch
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STAGES.map((stage) => (
          <div key={stage} className="panel min-w-[200px] max-w-[240px] flex-1 p-2">
            <p className="caps-label text-[10px]">{LABELS[stage]}</p>
            <div className="mt-2 space-y-2">
              {pitches
                .filter((p) => p.stage === stage)
                .map((p) => (
                  <div
                    key={p.id}
                    className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-xs"
                  >
                    <p className="font-semibold text-white">{p.ticker}</p>
                    <p className="mt-1 line-clamp-2 text-zinc-400">{p.thesis || "—"}</p>
                    <p className="mt-1 text-[10px] text-zinc-600">{p.analystName}</p>
                    <p className="text-[10px] text-zinc-600">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                    {p.researchId ? (
                      <Link
                        href={`/research?q=${encodeURIComponent(p.ticker)}`}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#f4c5c4] hover:text-white"
                      >
                        <BookOpen className="h-3 w-3" />
                        Research
                      </Link>
                    ) : null}
                    <div className="mt-2 flex flex-col gap-1 border-t border-white/[0.05] pt-2">
                      {STAGES.filter((s) => s !== p.stage).map((s) => {
                        if ((s === "position" || s === "rejected") && !canSetTerminal(actor.role)) return null;
                        if (p.analystId !== actor.id && !canSetTerminal(actor.role)) return null;
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={pending}
                            onClick={() => move(p, s)}
                            className="rounded-[6px] bg-white/[0.04] py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                          >
                            → {LABELS[s]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="panel w-full max-w-md p-5">
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
    </div>
  );
}
