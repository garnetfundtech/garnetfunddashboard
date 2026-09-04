import { requireApprovedProfile } from "@/lib/auth";
import { approvalToCsvRow, listApprovals } from "@/lib/risk-approvals";
import { csvResponse } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * §3.4: "The dashboard does not replace the Drive; it should export the
 * approval record as a row that can be filed in the transaction log." The
 * Governance Document requires every transaction record to carry the date,
 * amount, security and rationale [Gov. IV.a] — which is exactly the column set
 * approvalToCsvRow emits.
 */
export async function GET() {
  await requireApprovedProfile();
  const approvals = await listApprovals(true);
  const rows = approvals.map(approvalToCsvRow);
  const header = rows.length
    ? Object.keys(rows[0])
    : ["Approval date", "Security", "Team", "Sector", "Approved size (% NAV)"];

  return csvResponse(
    header,
    rows.map((r) => header.map((h) => r[h] ?? "")),
    "garnet-fund-position-approvals",
  );
}
