/**
 * Meeting overviews: the written record of each fund meeting, shown on the
 * Meeting Overview tab of /resources and stored in `meeting_overviews` (0032).
 *
 * Types only, so client components can import them; the queries live in
 * lib/meeting-overviews-store.ts.
 */
import type { UserRole } from "@/lib/types";

export type MeetingOverview = {
  id: string;
  /** YYYY-MM-DD, the day the meeting was held. */
  meetingDate: string;
  title: string;
  overview: string;
  createdBy: string | null;
  authorRole: UserRole;
  author: string;
  createdAt: string;
  updatedAt: string;
};
