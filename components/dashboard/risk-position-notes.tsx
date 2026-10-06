"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableShell } from "@/components/dashboard/table-shell";
import { PrimaryBtn } from "@/components/dashboard/buttons";
import {
  NOTE_ACTIONS,
  NOTE_ACTION_LABEL,
  type NoteAction,
  type PositionNote,
} from "@/lib/position-notes";
import { addPositionNoteAction, deletePositionNoteAction } from "@/app/(dashboard)/risk/actions";

const INPUT = "w-full border border-line bg-surface px-2 py-[5px] text-[13px] text-ink";

const ACTION_TONE: Record<NoteAction, string> = {
  add: "text-pos",
  initiate: "text-pos",
  trim: "text-warn",
  exit: "text-neg",
  hold: "text-ink-2",
  other: "text-ink-2",
};

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A quick write-up attached to a position: what the fund did (trim, add, …)
 * and why. The date and time are stamped by the database when it is saved.
 */
export function PositionNotes({
  notes,
  symbols,
  viewerId,
  canModerate,
}: {
  notes: PositionNote[];
  /** Live positions, offered first in the picker. Any ticker can be typed. */
  symbols: string[];
  viewerId: string;
  /** The Risk Manager can delete anyone's note; everyone else only their own. */
  canModerate: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  const noted = useMemo(() => [...new Set(notes.map((n) => n.symbol))].sort(), [notes]);
  const visible = filter ? notes.filter((n) => n.symbol === filter) : notes;

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await addPositionNoteAction(formData);
      if (!res.ok) {
        setError(res.message ?? "Could not save the note.");
        return;
      }
      formRef.current?.reset();
    });
  };

  return (
    <TableShell
      title="Position notes"
      count={notes.length}
      actions={
        noted.length > 0 ? (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-line bg-surface px-2 py-[3px] text-[12.5px] text-ink"
            aria-label="Filter notes by position"
          >
            <option value="">All positions</option>
            {noted.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : undefined
      }
      footer="Why we trimmed, added to or exited a name, stamped with who wrote it and when."
    >
      <form ref={formRef} action={submit} className="flex flex-col gap-2 border-b border-line p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_160px_1fr]">
          <label className="flex flex-col gap-1">
            <span className="caps text-[11px] text-ink-3">Position</span>
            <input
              name="symbol"
              list="position-note-symbols"
              required
              placeholder="Ticker"
              autoComplete="off"
              onChange={(e) => (e.target.value = e.target.value.toUpperCase())}
              className={INPUT}
            />
            <datalist id="position-note-symbols">
              {symbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="caps text-[11px] text-ink-3">Decision</span>
            <select name="action" required defaultValue="trim" className={INPUT}>
              {NOTE_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {NOTE_ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="caps text-[11px] text-ink-3">Why</span>
            <textarea
              name="note"
              required
              rows={2}
              maxLength={5000}
              placeholder="e.g. Trimmed to 4% after the run-up into earnings; thesis intact but sizing above approved."
              className={cn(INPUT, "resize-y")}
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3">
          {error && <span className="text-[12.5px] text-neg">{error}</span>}
          <PrimaryBtn type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save note"}
          </PrimaryBtn>
        </div>
      </form>

      <table className="w-full">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
            <th className="px-2.5 py-1.5 font-medium">Date &amp; time</th>
            <th className="px-2.5 py-1.5 font-medium">Position</th>
            <th className="px-2.5 py-1.5 font-medium">Decision</th>
            <th className="px-2.5 py-1.5 font-medium">Why</th>
            <th className="px-2.5 py-1.5 font-medium">By</th>
            <th className="px-2.5 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-[13px] text-ink-3">
                No notes yet.
              </td>
            </tr>
          )}
          {visible.map((n) => (
            <tr key={n.id} className="border-b border-line align-top last:border-b-0">
              <td className="whitespace-nowrap px-2.5 py-1.5 text-[12.5px] text-ink-3">{stamp(n.createdAt)}</td>
              <td className="px-2.5 py-1.5 text-[13px] font-medium text-ink">{n.symbol}</td>
              <td className={cn("px-2.5 py-1.5 text-[12.5px] font-medium uppercase", ACTION_TONE[n.action])}>
                {NOTE_ACTION_LABEL[n.action] ?? n.action}
              </td>
              <td className="whitespace-pre-wrap px-2.5 py-1.5 text-[13px] text-ink-2">{n.note}</td>
              <td className="whitespace-nowrap px-2.5 py-1.5 text-[12.5px] text-ink-3">{n.author}</td>
              <td className="px-2.5 py-1.5 text-right">
                {(canModerate || n.createdBy === viewerId) && (
                  <form
                    action={deletePositionNoteAction}
                    onSubmit={(e) => {
                      if (!confirm(`Delete this ${n.symbol} note?`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="text-ink-3 hover:text-neg" aria-label="Delete note">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
