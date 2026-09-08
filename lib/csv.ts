import { NextResponse } from "next/server";

/**
 * Formats a timestamp the way a spreadsheet will actually read it.
 *
 * Postgres hands back `2026-09-04T22:26:42.462386+00:00`. Excel does not
 * recognise that as a date — it lands as left-aligned text, so the column
 * cannot be sorted chronologically or filtered by range, which is most of why
 * anyone opens the alert log in a spreadsheet. `YYYY-MM-DD HH:MM` parses as a
 * datetime in Excel, Google Sheets and Numbers alike.
 *
 * Rendered in UTC, and the column header says so, because the alternative is
 * a file whose timestamps depend on which machine exported it.
 */
export function csvTimestamp(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

/** Date only, for columns that carry no meaningful time of day. */
export function csvDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

/**
 * A CSV download that opens correctly in Excel.
 *
 * Three things this handles that a plain join does not:
 *
 * RFC 4180 quoting — a resolution note containing a comma or a newline has to
 * survive the trip into the Google Drive transaction records, which is what
 * these exports exist for [Risk spec §3.4, §4.3].
 *
 * A UTF-8 byte-order mark. Excel assumes the legacy system codepage for a CSV
 * without one, so the characters this app actually emits — the − in a negative
 * percentage, the · between a sector and its value, the § in a source citation
 * — arrive as mojibake. Three bytes fixes it, and every other reader ignores
 * them.
 *
 * Formula neutralisation. A cell beginning = + - or @ is evaluated as a
 * formula on open, and the resolution note and thesis fields are free text a
 * person types. That is a correctness problem before it is a security one —
 * a note reading "-30% was the trigger" becomes #NAME? — but it is also the
 * standard CSV injection vector, and these files get mailed around. Prefixing
 * a tab makes the cell text; the tab is invisible in the grid.
 */
export function csvResponse(header: string[], rows: unknown[][], filename: string) {
  const cell = (v: unknown) => {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    let s = v == null ? "" : String(v);
    // A value that parses as a number is data, not a formula. Neutralising it
    // would land it in Excel as left-aligned text, and a column of text
    // cannot be summed, charted or conditionally formatted — which would
    // break the export in the course of protecting it. −95.28 stays a number;
    // "-30% was the trigger" does not, and gets the tab.
    const numeric = s.trim() !== "" && Number.isFinite(Number(s));
    if (!numeric && /^[=+\-@\t\r]/.test(s)) s = `\t${s}`;
    return /[",\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");

  // \uFEFF explicitly: a literal BOM in source does not survive every editor
  // or transport, and a missing one is invisible until Excel mangles a −.
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
