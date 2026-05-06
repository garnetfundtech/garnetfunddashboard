import { getResearchItems } from "@/lib/data";
import { ResearchTableClient } from "@/components/dashboard/research-table-client";

export default async function ResearchPage() {
  const items = await getResearchItems();
  const tickers = [...new Set(items.map((i) => i.ticker).filter((t) => t !== "—"))];
  return <ResearchTableClient items={items} tickers={tickers} />;
}
