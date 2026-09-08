import { requireApprovedProfile } from "@/lib/auth";
import { getAlertLog } from "@/lib/risk-episodes";
import { csvResponse, csvTimestamp } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * §4.3: "The log is exported to CSV. This is the compliance record the
 * Governance Document requires for compliance checks and any actions taken in
 * response [Gov. IV.a, IV.b step 5]."
 *
 * CSV rather than the .xlsx every other export in this app uses, because the
 * spec asks for a format "suitable for filing in the Google Drive transaction
 * records" and Drive renders a CSV inline without a download round-trip.
 */
export async function GET() {
  await requireApprovedProfile();
  const rows = await getAlertLog(5000);

  // Headers name the unit so a reader importing this does not have to guess
  // the timezone or whether a percentage is already scaled.
  const header = [
    "Opened at (UTC)",
    "Closed at (UTC)",
    "Monitor",
    "Position",
    "State",
    "Value at trigger",
    "Peak excursion",
    "Threshold",
    "Notified",
    "Notified at (UTC)",
    "Acknowledged at (UTC)",
    "Resolution note",
  ];

  const body = rows.map((r) => [
    csvTimestamp(r.opened_at),
    csvTimestamp(r.closed_at),
    r.monitor_label,
    r.subject ?? "",
    r.status,
    r.value_at_trigger ?? "",
    r.peak_value ?? "",
    r.threshold ?? "",
    (r.notified ?? []).join("; "),
    csvTimestamp(r.notified_at),
    csvTimestamp(r.acknowledged_at),
    r.resolution_note ?? "",
  ]);

  return csvResponse(header, body, "garnet-fund-alert-log");
}

