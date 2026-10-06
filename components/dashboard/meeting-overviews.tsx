"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import { canManageContent } from "@/lib/roles";
import type { MeetingOverview } from "@/lib/meeting-overviews";
import type { UserRole } from "@/lib/types";
import {
  addMeetingOverviewAction,
  deleteMeetingOverviewAction,
  updateMeetingOverviewAction,
} from "@/app/(dashboard)/resources/actions";

const INPUT = "w-full border border-line bg-surface px-2 py-[5px] text-[13px] text-ink";

/** A YYYY-MM-DD date as the day it names, not shifted by the viewer's time zone. */
function fmtMeetingDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function OverviewForm({
  initial,
  onDone,
}: {
  initial?: MeetingOverview;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = initial
        ? await updateMeetingOverviewAction(formData)
        : await addMeetingOverviewAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  };

  return (
    <form action={submit} className="flex flex-col gap-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[170px_1fr]">
        <label className="flex flex-col gap-1">
          <span className="caps text-[11px] text-ink-3">Meeting date</span>
          <input
            type="date"
            name="meetingDate"
            required
            defaultValue={initial?.meetingDate ?? todayYmd()}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="caps text-[11px] text-ink-3">Title</span>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title ?? ""}
            placeholder="e.g. Weekly IC meeting"
            className={INPUT}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="caps text-[11px] text-ink-3">Overview</span>
        <textarea
          name="overview"
          required
          rows={8}
          maxLength={20000}
          defaultValue={initial?.overview ?? ""}
          placeholder={"What was covered, what was decided, and who owns the follow-ups.\n\n- Pitches heard\n- Votes taken\n- Action items"}
          className={cn(INPUT, "resize-y leading-relaxed")}
        />
      </label>
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-[12.5px] text-neg">{error}</span>}
        <GhostBtn onClick={onDone} disabled={isPending}>
          Cancel
        </GhostBtn>
        <PrimaryBtn type="submit" disabled={isPending}>
          {isPending ? "Saving…" : initial ? "Save changes" : "Save overview"}
        </PrimaryBtn>
      </div>
    </form>
  );
}

export function MeetingOverviews({
  overviews,
  actor,
}: {
  overviews: MeetingOverview[];
  actor: { id: string; role: UserRole };
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return overviews;
    return overviews.filter(
      (o) => o.title.toLowerCase().includes(q) || o.overview.toLowerCase().includes(q),
    );
  }, [overviews, query]);

  const canManage = (o: MeetingOverview) =>
    canManageContent({
      actorId: actor.id,
      actorRole: actor.role,
      ownerId: o.createdBy,
      ownerRole: o.authorRole,
    });

  const remove = (o: MeetingOverview) => {
    if (!confirm(`Delete the overview for "${o.title}"?`)) return;
    const fd = new FormData();
    fd.set("id", o.id);
    startTransition(async () => {
      await deleteMeetingOverviewAction(fd);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 bg-paper-3 px-3 py-2">
          <div className="flex items-baseline gap-2">
            <span className="panel-title">Meeting overviews</span>
            <span className="num text-[12.5px] text-ink-3">({overviews.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {overviews.length > 0 && (
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search meetings"
                className="w-44 border border-line bg-surface px-2 py-[3px] text-[12.5px] text-ink"
              />
            )}
            {!adding && (
              <GhostBtn onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" />
                New overview
              </GhostBtn>
            )}
          </div>
        </div>
        {adding && (
          <div className="border-b border-line p-3">
            <OverviewForm onDone={() => setAdding(false)} />
          </div>
        )}
        {overviews.length === 0 && !adding && (
          <p className="px-3 py-12 text-center text-[13.5px] text-ink-3">
            No meetings written up yet. Use New overview to add the first one.
          </p>
        )}
        {overviews.length > 0 && visible.length === 0 && (
          <p className="px-3 py-8 text-center text-[13.5px] text-ink-3">No meetings match that search.</p>
        )}
      </div>

      {visible.map((o) => (
        <article key={o.id} className={cn("panel flex flex-col", isPending && "opacity-70")}>
          {editingId === o.id ? (
            <div className="p-3">
              <OverviewForm initial={o} onDone={() => setEditingId(null)} />
            </div>
          ) : (
            <>
              <header className="flex items-start justify-between gap-3 border-b border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="caps text-[11px] text-ink-3">{fmtMeetingDate(o.meetingDate)}</p>
                  <h3 className="text-[15px] font-semibold text-ink">{o.title}</h3>
                </div>
                {canManage(o) && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(o.id)}
                      className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-ink"
                      aria-label="Edit overview"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(o)}
                      disabled={isPending}
                      className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-neg"
                      aria-label="Delete overview"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </header>
              <p className="whitespace-pre-wrap px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-2">{o.overview}</p>
              <footer className="border-t border-line px-3 py-1.5 text-[12px] text-ink-3">
                Written by {o.author} · {fmtStamp(o.createdAt)}
                {o.updatedAt !== o.createdAt && <> · edited {fmtStamp(o.updatedAt)}</>}
              </footer>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
