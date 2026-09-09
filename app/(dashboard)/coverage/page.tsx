import { requireProfile } from "@/lib/auth";
import { getResearchItems } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CoveragePageClient } from "@/components/dashboard/coverage-page-client";
import { COVERAGE_TEAMS, toCoverageTeam } from "@/lib/sectors";
import {
  getCoverageTickers,
  getFilesByTicker,
  type TickerLookup,
} from "@/lib/coverage-tickers";

export type CoverageAnalyst = {
  id: string;
  name: string;
  role: string;
  sector: string | null;
};

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: profiles }, research, coverageTickers] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id,full_name,first_name,last_name,role,coverage_sector")
      .order("created_at"),
    getResearchItems(),
    getCoverageTickers(),
  ]);

  const analysts: CoverageAnalyst[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name:
      p.full_name ||
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      "Unknown",
    role: p.role as string,
    // Legacy GICS values still resolve to their team until 0024 has run.
    sector: toCoverageTeam(p.coverage_sector),
  }));

  // Every ticker the page can show a panel for: the ones people added, plus
  // the ones still only implied by a research write-up. Company names come
  // from the coverage row when there is one, so the file match can widen
  // beyond the symbol itself.
  const lookups = new Map<string, TickerLookup>();
  for (const row of coverageTickers) {
    lookups.set(row.ticker, {
      ticker: row.ticker,
      companyName: row.companyName,
    });
  }
  for (const item of research) {
    const ticker = item.ticker?.trim().toUpperCase();
    if (!ticker || ticker === "—") continue;
    if (!lookups.has(ticker)) lookups.set(ticker, { ticker, companyName: null });
  }

  const filesByTicker = await getFilesByTicker([...lookups.values()]);

  return (
    <CoveragePageClient
      analysts={analysts}
      research={research}
      sectors={[...COVERAGE_TEAMS]}
      viewerRole={profile.role}
      viewerId={profile.id}
      viewerSector={toCoverageTeam(profile.coverage_sector)}
      coverageTickers={coverageTickers}
      filesByTicker={filesByTicker}
      initialTicker={sp.ticker?.trim().toUpperCase() || null}
    />
  );
}
