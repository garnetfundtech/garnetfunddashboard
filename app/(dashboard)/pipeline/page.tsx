import { PipelineBoardClient } from "@/components/dashboard/pipeline-board-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";
import { getPitches, getResearchOptionsForPipeline } from "@/lib/data";
import { requireProfile } from "@/lib/auth";

export default async function PipelinePage() {
  await enforceNavAccess("/pipeline");
  const profile = await requireProfile();
  const [pitches, researchOptions] = await Promise.all([getPitches(), getResearchOptionsForPipeline()]);

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Pitch pipeline</h1>
      <PipelineBoardClient
        pitches={pitches}
        actor={{ id: profile.id, role: profile.role }}
        researchOptions={researchOptions}
      />
    </div>
  );
}
