import { requireProfile } from "@/lib/auth";
import { getTeamBrowseData } from "@/lib/team-files";
import { GICS_SECTORS, isGicsSector } from "@/lib/sectors";
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
  const sector = isGicsSector(requested)
    ? requested
    : profile.coverage_sector && isGicsSector(profile.coverage_sector)
      ? profile.coverage_sector
      : GICS_SECTORS[0];

  const data = await getTeamBrowseData({
    sector,
    folderId: sp.folder ?? null,
    profile,
  });

  return (
    <TeamFilesClient
      data={data}
      sectors={[...GICS_SECTORS]}
      actor={{
        id: profile.id,
        role: profile.role,
        sector: profile.coverage_sector,
      }}
    />
  );
}
