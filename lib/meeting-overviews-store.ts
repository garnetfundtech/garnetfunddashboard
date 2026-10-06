/** Reads for `meeting_overviews` (0032). Server only. */
import { createAdminClient } from "@/lib/supabase/admin";
import type { MeetingOverview } from "@/lib/meeting-overviews";
import type { UserRole } from "@/lib/types";

/**
 * Newest meeting first. Returns an empty list rather than throwing when the
 * table is missing, so /resources still renders before 0032 has been applied.
 */
export async function getMeetingOverviews(limit = 200): Promise<MeetingOverview[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("meeting_overviews")
      .select(
        "id, meeting_date, title, overview, created_by, author_role, created_at, updated_at, author:user_profiles(full_name, email)",
      )
      .order("meeting_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => {
      const author = (Array.isArray(row.author) ? row.author[0] : row.author) as
        | { full_name: string | null; email: string | null }
        | null;
      return {
        id: row.id as string,
        meetingDate: row.meeting_date as string,
        title: row.title as string,
        overview: row.overview as string,
        createdBy: (row.created_by as string | null) ?? null,
        authorRole: (row.author_role as UserRole) ?? "analyst",
        author: author?.full_name || author?.email || "Former member",
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      };
    });
  } catch {
    return [];
  }
}
