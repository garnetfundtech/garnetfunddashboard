import { enforceNavAccess } from "@/lib/dashboard-guard";
import {
  RESEARCH_FIRMS,
  findFirm,
  getResearchEmail,
  listResearchEmails,
} from "@/lib/corporate-research";
import { CorporateResearchClient } from "@/components/dashboard/corporate-research-client";

export default async function CorporateResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ firm?: string; open?: string }>;
}) {
  await enforceNavAccess("/corporate-research");
  const sp = await searchParams;
  const firm = findFirm(sp.firm) ?? RESEARCH_FIRMS[0];

  const [emails, opened] = await Promise.all([
    listResearchEmails(firm.slug),
    sp.open ? getResearchEmail(sp.open) : Promise.resolve(null),
  ]);

  return (
    <CorporateResearchClient
      firms={RESEARCH_FIRMS.map((f) => ({ slug: f.slug, label: f.label }))}
      firm={firm.slug}
      emails={emails}
      // An id from another firm's tab would otherwise open under this one.
      opened={opened?.firm === firm.slug ? opened : null}
    />
  );
}
