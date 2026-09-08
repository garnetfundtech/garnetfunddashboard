import { requireProfile } from "@/lib/auth";
import { getTeamBrowseData } from "@/lib/team-files";
import { COVERAGE_TEAMS, isCoverageTeam, toCoverageTeam } from "@/lib/sectors";
import { TeamFilesClient } from "@/components/dashboard/team-files-client";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; folder?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();

  // Default to the viewer's own coverage team so an analyst lands where they
  // actually work; fall back to the first sector for unassigned users.
  const requested = sp.team ?? "";
  const sector =
    (isCoverageTeam(requested) ? requested : null) ??
    toCoverageTeam(profile.coverage_sector) ??
    COVERAGE_TEAMS[0];

  const data = await getTeamBrowseData({
    sector,
    folderId: sp.folder ?? null,
    profile,
  });

  return (
    <TeamFilesClient
      data={data}
      sectors={[...COVERAGE_TEAMS]}
      actor={{
        id: profile.id,
        role: profile.role,
        sector: profile.coverage_sector,
      }}
    />
  );
}
