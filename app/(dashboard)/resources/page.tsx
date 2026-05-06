import { getResourcesWithUrls } from "@/lib/data";
import { ResourcesTableClient } from "@/components/dashboard/resources-table-client";
import { requireProfile } from "@/lib/auth";

export default async function ResourcesPage() {
  const profile = await requireProfile();
  const resources = await getResourcesWithUrls();
  return (
    <ResourcesTableClient
      resources={resources}
      actor={{ id: profile.id, role: profile.role }}
    />
  );
}
