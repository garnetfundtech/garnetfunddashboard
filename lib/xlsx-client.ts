/** Client-side Excel (.xlsx) download — no server round-trip needed when the rows are already in state. */
import * as XLSX from "xlsx";

export function downloadXlsx(headers: string[], rows: unknown[][], filename: string) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const xlsxName = filename.replace(/\.csv$/i, "") + ".xlsx";
  XLSX.writeFile(workbook, xlsxName);
}
