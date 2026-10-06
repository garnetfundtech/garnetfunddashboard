/** Reads and writes for `position_notes` (0031). Server only. */
import { createAdminClient } from "@/lib/supabase/admin";
import type { NoteAction, PositionNote } from "@/lib/position-notes";

/**
 * Newest first. Returns an empty list rather than throwing when the table is
 * missing, so the board still renders before 0031 has been applied.
 */
export async function getPositionNotes(limit = 300): Promise<PositionNote[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("position_notes")
      .select("id, symbol, action, note, created_at, created_by, author:user_profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => {
      const author = (Array.isArray(row.author) ? row.author[0] : row.author) as
        | { full_name: string | null; email: string | null }
        | null;
      return {
        id: row.id as string,
        symbol: row.symbol as string,
        action: row.action as NoteAction,
        note: row.note as string,
        createdAt: row.created_at as string,
        createdBy: (row.created_by as string | null) ?? null,
        author: author?.full_name || author?.email || "Former member",
      };
    });
  } catch {
    return [];
  }
}

export async function addPositionNote(params: {
  symbol: string;
  action: NoteAction;
  note: string;
  createdBy: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("position_notes").insert({
    symbol: params.symbol,
    action: params.action,
    note: params.note,
    created_by: params.createdBy,
  });
  if (error) throw new Error(`Could not save the note: ${error.message}`);
}

/** Who wrote a note, so the caller can check they may delete it. Null if it is gone. */
export async function getNoteAuthorId(id: string): Promise<{ createdBy: string | null } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("position_notes").select("created_by").eq("id", id).maybeSingle();
  if (!data) return null;
  return { createdBy: (data.created_by as string | null) ?? null };
}

export async function deletePositionNote(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("position_notes").delete().eq("id", id);
  if (error) throw new Error(`Could not delete the note: ${error.message}`);
}
