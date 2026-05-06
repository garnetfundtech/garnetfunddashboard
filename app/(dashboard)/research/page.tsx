import { getResearchItems } from "@/lib/data";
import { ResearchTableClient } from "@/components/dashboard/research-table-client";
import { requireProfile } from "@/lib/auth";
import { fetchPortfolioSummary } from "@/lib/market-data";

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [items, portfolio] = await Promise.all([getResearchItems(), fetchPortfolioSummary()]);
  const holdTickers = new Set((portfolio?.positions ?? []).map((p) => p.ticker.toUpperCase()));
  return (
    <ResearchTableClient
      key={sp.q ?? "_"}
      items={items}
      actor={{ id: profile.id, role: profile.role }}
      initialQuery={sp.q ?? ""}
      holdTickers={holdTickers}
    />
  );
}
