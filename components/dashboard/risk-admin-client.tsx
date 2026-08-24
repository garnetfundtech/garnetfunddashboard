"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { TableShell } from "@/components/dashboard/table-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { GhostBtn } from "@/components/dashboard/buttons";
import { Download } from "lucide-react";
import type { RiskLimit } from "@/lib/risk-parameters";
import { updateThresholdAction, resolveBreachAction } from "@/app/(dashboard)/risk-admin/actions";

export type BreachLogRow = {
  id: string;
  fired_at: string;
  limit_id: string;
  limit_label: string;
  target: string | null;
  actual_value: number | null;
  drift_or_trade: string | null;
  resolved_at: string | null;
  note: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ThresholdRow({ limit }: { limit: RiskLimit }) {
  const [editing, setEditing] = useState(false);

  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-3 py-2 text-[14px] text-ink">{limit.label}</td>
      <td className="px-3 py-2 text-[13px] text-ink-3">{limit.target}</td>
      <td className="px-3 py-2">
        {!editing ? (
          <div className="flex items-center gap-2">
            <span className="num text-[13.5px] text-ink">
              {limit.kind === "range"
                ? `${limit.rangeGreen?.[0]}–${limit.rangeGreen?.[1]} / ${limit.rangeYellow?.[0]}–${limit.rangeYellow?.[1]}`
                : `${limit.green} / ${limit.yellow}`}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="text-[12.5px] text-ink-3 underline hover:text-ink">
              Edit
            </button>
          </div>
        ) : limit.kind === "range" ? (
          <div className="flex flex-col gap-1.5">
            <form action={updateThresholdAction} className="flex items-center gap-1.5">
              <input type="hidden" name="limitId" value={limit.id} />
              <input type="hidden" name="field" value="rangeGreen" />
              <span className="text-[11px] text-ink-3">Green</span>
              <input
                name="value"
                defaultValue={`${limit.rangeGreen?.[0]},${limit.rangeGreen?.[1]}`}
                className="w-24 border border-line bg-surface px-1.5 py-1 text-[12.5px] text-ink"
              />
              <button type="submit" className="text-[12.5px] text-pos underline">Save</button>
            </form>
            <form action={updateThresholdAction} className="flex items-center gap-1.5">
              <input type="hidden" name="limitId" value={limit.id} />
              <input type="hidden" name="field" value="rangeYellow" />
              <span className="text-[11px] text-ink-3">Yellow</span>
              <input
                name="value"
                defaultValue={`${limit.rangeYellow?.[0]},${limit.rangeYellow?.[1]}`}
                className="w-24 border border-line bg-surface px-1.5 py-1 text-[12.5px] text-ink"
              />
              <button type="submit" className="text-[12.5px] text-pos underline">Save</button>
            </form>
            <button type="button" onClick={() => setEditing(false)} className="self-start text-[12px] text-ink-3 underline">
              Done
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <form action={updateThresholdAction} className="flex items-center gap-1">
              <input type="hidden" name="limitId" value={limit.id} />
              <input type="hidden" name="field" value="green" />
              <span className="text-[11px] text-ink-3">G</span>
              <input name="value" defaultValue={limit.green} className="w-14 border border-line bg-surface px-1.5 py-1 text-[12.5px] text-ink" />
              <button type="submit" className="text-[12.5px] text-pos underline">Save</button>
            </form>
            <form action={updateThresholdAction} className="flex items-center gap-1">
              <input type="hidden" name="limitId" value={limit.id} />
              <input type="hidden" name="field" value="yellow" />
              <span className="text-[11px] text-ink-3">Y</span>
              <input name="value" defaultValue={limit.yellow} className="w-14 border border-line bg-surface px-1.5 py-1 text-[12.5px] text-ink" />
              <button type="submit" className="text-[12.5px] text-pos underline">Save</button>
            </form>
            <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-ink-3 underline">
              Done
            </button>
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-[12.5px] text-ink-3">{limit.cadence}</td>
    </tr>
  );
}

function BreachRow({ row }: { row: BreachLogRow }) {
  const [showNote, setShowNote] = useState(false);
  return (
    <tr className="border-b border-line last:border-b-0 align-top">
      <td className="px-3 py-2 text-[13px] text-ink-3">{fmtDate(row.fired_at)}</td>
      <td className="px-3 py-2 text-[13.5px] text-ink">{row.limit_label}</td>
      <td className="px-3 py-2 num text-[13.5px] text-ink">{row.actual_value?.toFixed(2) ?? "—"}</td>
      <td className="px-3 py-2">
        {row.drift_or_trade && (
          <StatusPill
            label={row.drift_or_trade}
            tone={row.drift_or_trade === "trade" ? "rose" : row.drift_or_trade === "drift" ? "amber" : "neutral"}
            dot={false}
          />
        )}
      </td>
      <td className="px-3 py-2">
        {row.resolved_at ? (
          <StatusPill label="Resolved" tone="emerald" dot={false} />
        ) : showNote ? (
          <form action={resolveBreachAction} className="flex flex-col gap-1.5">
            <input type="hidden" name="id" value={row.id} />
            <textarea
              name="note"
              placeholder="What happened, what we did"
              className="w-56 border border-line bg-surface px-2 py-1 text-[12.5px] text-ink"
              rows={2}
            />
            <button type="submit" className="self-start text-[12.5px] text-pos underline">Mark resolved</button>
          </form>
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="text-[12.5px] text-ink-3 underline hover:text-ink">
            Resolve
          </button>
        )}
        {row.note && <p className="mt-1 text-[12px] text-ink-3">{row.note}</p>}
      </td>
    </tr>
  );
}

export function RiskAdminClient({ limits, breachLog }: { limits: RiskLimit[]; breachLog: BreachLogRow[] }) {
  const openBreaches = breachLog.filter((b) => !b.resolved_at).length;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Risk Alert Admin"
        meta={`${openBreaches} open breach${openBreaches === 1 ? "" : "es"}`}
        actions={
          <GhostBtn onClick={() => window.open("/api/risk/breach-log/export", "_blank")}>
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </GhostBtn>
        }
      />

      <TableShell title="Thresholds" count={limits.length}>
        <table className="w-full">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Green / Yellow</th>
              <th className="px-3 py-2 font-medium">Cadence</th>
            </tr>
          </thead>
          <tbody>
            {limits.map((l) => (
              <ThresholdRow key={l.id} limit={l} />
            ))}
          </tbody>
        </table>
      </TableShell>

      <TableShell title="Breach Log" count={breachLog.length} footer="Every red is logged permanently: the audit trail for the bylaws.">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
              <th className="px-3 py-2 font-medium">Fired</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Cause</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {breachLog.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-[13.5px] text-ink-3">
                  No breaches logged yet.
                </td>
              </tr>
            )}
            {breachLog.map((row) => (
              <BreachRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
