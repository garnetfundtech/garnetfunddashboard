import { NextResponse } from "next/server";

/**
 * A CSV download with RFC 4180 quoting — a resolution note containing a comma
 * or a newline has to survive the trip into the Google Drive transaction
 * records, which is what these exports exist for [Risk spec §3.4, §4.3].
 */
export function csvResponse(header: string[], rows: unknown[][], filename: string) {
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
