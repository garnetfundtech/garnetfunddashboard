/**
 * Shared Excel (.xlsx) sheet builder — CSV can't be edited with formatting or
 * formulas kept intact, which is why every export in the app writes a real
 * workbook instead. Works both server-side (route handlers, returns a Buffer)
 * and client-side (lib/xlsx-client.ts wraps this for a browser download).
 */
import * as XLSX from "xlsx";

export function buildXlsxBuffer(headers: string[], rows: unknown[][], sheetName = "Sheet1"): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
