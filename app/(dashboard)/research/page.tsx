import { getResearchItems } from "@/lib/data";
import { ResearchTableClient } from "@/components/dashboard/research-table-client";
import { requireProfile } from "@/lib/auth";

export default async function ResearchPage() {
  const profile = await requireProfile();
  const items = await getResearchItems();
  return (
    <ResearchTableClient
      items={items}
      actor={{ id: profile.id, role: profile.role }}
    />
  );
}
