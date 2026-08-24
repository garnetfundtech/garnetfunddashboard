import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { buildXlsxBuffer } from "@/lib/xlsx-export";

/** Excel export of the full breach log — the audit trail the fund's bylaws require. */
export async function GET() {
  await requireRole(["admin", "developer", "pm"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("risk_breach_log")
    .select("fired_at, limit_id, limit_label, target, actual_value, drift_or_trade, resolved_at, note, decided_by")
    .order("fired_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const header = [
    "Fired At",
    "Item",
    "Label",
    "Target",
    "Actual Value",
    "Drift or Trade",
    "Resolved At",
    "Note",
    "Decided By",
  ];
  const rows = (data ?? []).map((r) => [
    r.fired_at,
    r.limit_id,
    r.limit_label,
    r.target,
    r.actual_value,
    r.drift_or_trade,
    r.resolved_at,
    r.note,
    r.decided_by,
  ]);

  const buffer = buildXlsxBuffer(header, rows, "Breach Log");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="garnet-fund-breach-log.xlsx"`,
    },
  });
}
