import { getResearchItems } from "@/lib/data";
import { ResearchTableClient } from "@/components/dashboard/research-table-client";
import { requireProfile } from "@/lib/auth";

export default async function ResearchPage() {
  const profile = await requireProfile();
  const items = await getResearchItems();
  const tickers = [...new Set(items.map((i) => i.ticker).filter((t) => t !== "—"))];
  return (
    <ResearchTableClient
      items={items}
      tickers={tickers}
      actor={{ id: profile.id, role: profile.role }}
    />
  );
}
