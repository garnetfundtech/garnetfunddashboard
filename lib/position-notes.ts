/**
 * Position notes: dated write-ups on why the fund trimmed, added to or exited
 * a name. Entered from the Risk board, stored in `position_notes` (0031).
 *
 * Types and labels only, so client components can import them; the queries
 * live in lib/position-notes-store.ts.
 */
export const NOTE_ACTIONS = ["trim", "add", "initiate", "exit", "hold", "other"] as const;
export type NoteAction = (typeof NOTE_ACTIONS)[number];

export const NOTE_ACTION_LABEL: Record<NoteAction, string> = {
  trim: "Trim",
  add: "Add",
  initiate: "Initiate",
  exit: "Exit",
  hold: "Hold",
  other: "Other",
};

export type PositionNote = {
  id: string;
  symbol: string;
  action: NoteAction;
  note: string;
  createdAt: string;
  createdBy: string | null;
  author: string;
};

export function isNoteAction(v: string): v is NoteAction {
  return (NOTE_ACTIONS as readonly string[]).includes(v);
}
