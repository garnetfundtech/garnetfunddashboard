import { holdings } from "@/lib/mock-data";
import type { HoldingRow } from "@/lib/types";

const columns = [
  "Ticker",
  "Company",
  "Sector",
  "1D",
  "5D",
  "1M",
  "3M",
  "6M",
  "1Y",
  "YTD",
  "% Year",
];

export function HoldingsTable({ rows = holdings }: { rows?: HoldingRow[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <div>
          <p className="caps-label">Portfolio Holdings</p>
          <h2 className="text-sm font-semibold text-white">Performance by Security</h2>
        </div>
        <select className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-1 text-sm text-zinc-300 outline-none">
          <option>All sectors</option>
          <option>Technology</option>
          <option>Healthcare</option>
          <option>Energy</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="bg-[var(--panel-soft)] text-zinc-400">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker} className="border-t border-[var(--border)] text-zinc-200">
                <td className="px-3 py-2 font-semibold text-white">{row.ticker}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.sector}</td>
                <td className="px-3 py-2">{row.day1}</td>
                <td className="px-3 py-2">{row.day5}</td>
                <td className="px-3 py-2">{row.month1}</td>
                <td className="px-3 py-2">{row.month3}</td>
                <td className="px-3 py-2">{row.month6}</td>
                <td className="px-3 py-2">{row.year1}</td>
                <td className="px-3 py-2">{row.ytd}</td>
                <td className="px-3 py-2">{row.annualized}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
