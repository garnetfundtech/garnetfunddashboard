import { getResourcesWithUrls } from "@/lib/data";
import { ResourcesTableClient } from "@/components/dashboard/resources-table-client";
import { requireProfile } from "@/lib/auth";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; mode?: "view" | "edit" }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const resources = await getResourcesWithUrls();
  return (
    <ResourcesTableClient
      resources={resources}
      actor={{ id: profile.id, role: profile.role }}
      initialOpenId={sp.open ?? ""}
      initialMode={sp.mode === "edit" ? "edit" : "view"}
    />
  );
}
