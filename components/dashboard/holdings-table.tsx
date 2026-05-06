import type { LivePosition } from "@/lib/types";
import { holdings } from "@/lib/mock-data";
import type { HoldingRow } from "@/lib/types";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function colorClass(n: number) {
  return n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-400";
}

// ── Live positions view ───────────────────────────────────────────────────────

function LiveHoldingsTable({ positions }: { positions: LivePosition[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <p className="caps-label">Portfolio Holdings</p>
          <h2 className="text-sm font-semibold text-white">Live Positions</h2>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          Live
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-xs">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              {["Ticker", "Name", "Type", "Qty", "Avg Cost", "Price", "Mkt Value", "Unreal P&L", "Unreal %", "Day P&L", "Day %", "Weight"].map((col) => (
                <th key={col} className="px-3 py-2 text-left font-medium">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-zinc-500">
                  No positions found. Holdings will appear here after securities are purchased.
                </td>
              </tr>
            ) : (
              positions.map((pos) => (
                <tr key={pos.ticker} className="text-zinc-200 odd:bg-white/[0.015]">
                  <td className="px-3 py-2 font-semibold text-white">{pos.ticker}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-zinc-300">{pos.name}</td>
                  <td className="px-3 py-2 text-zinc-500">{pos.assetType}</td>
                  <td className="px-3 py-2">{pos.quantity.toLocaleString()}</td>
                  <td className="px-3 py-2">{fmtUsd(pos.avgCost)}</td>
                  <td className="px-3 py-2 font-medium text-white">{fmtUsd(pos.currentPrice)}</td>
                  <td className="px-3 py-2">{fmtUsd(pos.marketValue)}</td>
                  <td className={`px-3 py-2 font-medium ${colorClass(pos.unrealizedPnl)}`}>
                    {fmtUsd(pos.unrealizedPnl)}
                  </td>
                  <td className={`px-3 py-2 ${colorClass(pos.unrealizedPnlPct)}`}>
                    {fmtPct(pos.unrealizedPnlPct)}
                  </td>
                  <td className={`px-3 py-2 ${colorClass(pos.dayPnl)}`}>
                    {fmtUsd(pos.dayPnl)}
                  </td>
                  <td className={`px-3 py-2 ${colorClass(pos.dayPnlPct)}`}>
                    {fmtPct(pos.dayPnlPct)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{pos.weight.toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Fallback legacy view (mock or DB snapshot) ────────────────────────────────

const LEGACY_COLS = ["Ticker", "Company", "Sector", "1D", "5D", "1M", "3M", "6M", "1Y", "YTD", "Ann."];

function LegacyHoldingsTable({ rows }: { rows: HoldingRow[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <p className="caps-label">Portfolio Holdings</p>
          <h2 className="text-sm font-semibold text-white">Performance by Security</h2>
        </div>
        <select className="glass-input px-2 py-1 text-sm text-zinc-300 outline-none">
          <option>All sectors</option>
          <option>Technology</option>
          <option>Healthcare</option>
          <option>Energy</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              {LEGACY_COLS.map((col) => (
                <th key={col} className="px-3 py-2 text-left font-medium">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker} className="text-zinc-200 odd:bg-white/[0.015]">
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

// ── Public export — picks the right view ─────────────────────────────────────

export function HoldingsTable({
  livePositions,
  rows = holdings,
}: {
  livePositions?: LivePosition[] | null;
  rows?: HoldingRow[];
}) {
  if (livePositions !== undefined && livePositions !== null) {
    return <LiveHoldingsTable positions={livePositions} />;
  }
  return <LegacyHoldingsTable rows={rows} />;
}
