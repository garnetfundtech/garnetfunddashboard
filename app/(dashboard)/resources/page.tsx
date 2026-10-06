import { getResourcesWithUrls } from "@/lib/data";
import { ResourcesTableClient } from "@/components/dashboard/resources-table-client";
import { requireProfile } from "@/lib/auth";
import { getMeetingOverviews } from "@/lib/meeting-overviews-store";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; mode?: "view" | "edit"; tab?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [resources, meetingOverviews] = await Promise.all([getResourcesWithUrls(), getMeetingOverviews()]);
  return (
    <ResourcesTableClient
      resources={resources}
      actor={{ id: profile.id, role: profile.role }}
      initialOpenId={sp.open ?? ""}
      initialMode={sp.mode === "edit" ? "edit" : "view"}
      meetingOverviews={meetingOverviews}
      initialTab={sp.tab === "meetings" ? "meetings" : "library"}
    />
  );
}
