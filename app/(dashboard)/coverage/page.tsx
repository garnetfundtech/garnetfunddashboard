import { requireProfile } from "@/lib/auth";
import { getResearchItems } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CoveragePageClient } from "@/components/dashboard/coverage-page-client";
import { GICS_SECTORS } from "@/lib/sectors";

export type CoverageAnalyst = {
  id: string;
  name: string;
  role: string;
  sector: string | null;
};

export default async function CoveragePage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: profiles }, research] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id,full_name,first_name,last_name,role,coverage_sector")
      .order("created_at"),
    getResearchItems(),
  ]);

  const analysts: CoverageAnalyst[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name:
      p.full_name ||
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      "Unknown",
    role: p.role as string,
    sector: p.coverage_sector ?? null,
  }));

  return (
    <CoveragePageClient
      analysts={analysts}
      research={research}
      sectors={[...GICS_SECTORS]}
    />
  );
}
