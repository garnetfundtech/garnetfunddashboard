import { getResourcesWithUrls } from "@/lib/data";
import { ResourcesTableClient } from "@/components/dashboard/resources-table-client";

export default async function ResourcesPage() {
  const resources = await getResourcesWithUrls();
  return <ResourcesTableClient resources={resources} />;
}
