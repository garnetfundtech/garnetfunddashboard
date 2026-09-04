"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { TableShell } from "@/components/dashboard/table-shell";
import { StatusPill, type Tone } from "@/components/dashboard/status-pill";
import { GhostBtn } from "@/components/dashboard/buttons";
import { CONFIG_DEFS, type ConfigDef, type ConfigStatus, type RiskConfig } from "@/lib/risk-config";
import {
  saveConfigAction,
  saveBlackoutAction,
  saveCoverageSectorsAction,
} from "@/app/(dashboard)/risk-admin/actions";

const INPUT = "border border-line bg-surface px-1.5 py-1 text-[12.5px] text-ink";

const STATUS_TONE: Record<ConfigStatus, Tone> = {
  final: "emerald",
  "amendment-pending": "blue",
  proposed: "amber",
  pending: "rose",
  operating: "neutral",
};

const STATUS_LABEL: Record<ConfigStatus, string> = {
  final: "Final",
  "amendment-pending": "IPS text pending",
  proposed: "Proposed",
  pending: "PENDING committee",
  operating: "Operating preference",
};

const SECTION_LABEL: Record<ConfigDef["section"], string> = {
  exposure: "Exposure and volatility",
  allocation: "Allocation and concentration",
  sizing: "Position sizing",
  stops: "Stop-loss mechanism",
  liquidity: "Liquidity and balance sheet",
  options: "Options",
  calendar: "Calendar",
  method: "Calculation method",
};

function formatValue(def: ConfigDef, value: number | null): string {
  if (value == null) return "not set";
  if (def.unit === "$") return `$${value.toLocaleString("en-US")}`;
  if (def.unit === "%") return `${value}%`;
  if (def.unit === "days") return `${value}`;
  return String(value);
}

function ConfigRow({
  def,
  value,
  overridden,
}: {
  def: ConfigDef;
  value: number | null;
  overridden: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <tr className="border-b border-line align-top last:border-b-0">
      <td className="px-2.5 py-2">
        <p className="text-[13px] text-ink">{def.label}</p>
        {def.note && <p className="mt-0.5 max-w-lg text-[11.5px] leading-snug text-ink-3">{def.note}</p>}
      </td>
      <td className="px-2.5 py-2 text-[12px] text-ink-3">{def.source}</td>
      <td className="px-2.5 py-2">
        <StatusPill label={STATUS_LABEL[def.status]} tone={STATUS_TONE[def.status]} dot={false} />
      </td>
      <td className="px-2.5 py-2">
        {editing ? (
          <form action={saveConfigAction} className="flex flex-col gap-1.5">
            <input type="hidden" name="key" value={def.key} />
            <div className="flex items-center gap-1.5">
              <input
                name="value"
                type="number"
                step="any"
                defaultValue={value ?? ""}
                placeholder="leave blank to unset"
                className={cn(INPUT, "w-32")}
              />
              <span className="text-[11px] text-ink-3">{def.unit}</span>
            </div>
            <input
              name="reason"
              required
              placeholder="Reason (required — feeds the Decision Log)"
              className={cn(INPUT, "w-72")}
            />
            <div className="flex items-center gap-2">
              <button type="submit" className="text-[12.5px] text-pos underline">
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-ink-3 underline">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className={cn("num text-[13.5px]", value == null ? "text-ink-3 italic" : "text-ink")}>
              {formatValue(def, value)}
            </span>
            {overridden && <span className="text-[10.5px] uppercase tracking-wider text-info">edited</span>}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[12.5px] text-ink-3 underline hover:text-ink"
            >
              Edit
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export type ConfigHistoryRow = {
  id: string;
  key: string;
  old_value: string | null;
  new_value: string;
  reason: string;
  changed_at: string;
  changed_by_name: string | null;
};

export function RiskAdminClient({
  config,
  history,
}: {
  config: RiskConfig;
  history: ConfigHistoryRow[];
}) {
  const sections = [...new Set(CONFIG_DEFS.map((d) => d.section))];
  const pendingCount = CONFIG_DEFS.filter((d) => config.values[d.key] == null).length;
  const overridden = new Set(config.overridden);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Risk Admin"
        meta={
          <span className="text-[12.5px] text-ink-3">
            {pendingCount} parameter{pendingCount === 1 ? "" : "s"} still unset
          </span>
        }
        actions={
          <GhostBtn onClick={() => window.open("/api/risk/approvals/export", "_blank")}>
            <Download className="h-3.5 w-3.5" />
            Approvals CSV
          </GhostBtn>
        }
      />

      <div className="panel px-3 py-2 text-[12.5px] text-ink-3">
        Every limit on the risk dashboard reads from this table. Nothing in the IPS is hardcoded, and every change
        is logged below with its reason. A parameter left unset is one the Committee has not decided: the monitor
        that depends on it shows its value and declines to score it, rather than being given a plausible number
        somebody might then act on.
      </div>

      {sections.map((section) => {
        const defs = CONFIG_DEFS.filter((d) => d.section === section);
        if (!defs.length) return null;
        return (
          <TableShell key={section} title={SECTION_LABEL[section]} count={defs.length}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="px-2.5 py-1.5 font-medium">Parameter</th>
                  <th className="px-2.5 py-1.5 font-medium">Source</th>
                  <th className="px-2.5 py-1.5 font-medium">Status</th>
                  <th className="px-2.5 py-1.5 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {defs.map((def) => (
                  <ConfigRow
                    key={def.key}
                    def={def}
                    value={config.values[def.key]}
                    overridden={overridden.has(def.key)}
                  />
                ))}
              </tbody>
            </table>
          </TableShell>
        );
      })}

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <section className="panel flex flex-col gap-2 p-3">
          <p className="panel-title">Summer trading blackout</p>
          <p className="text-[12px] text-ink-3">
            Gov. VIII.c: no trading between the last day of Spring semester and the first day of Fall. Entered per
            university calendar each year. With no window set, the trading-calendar monitor reports &ldquo;not
            configured&rdquo; rather than issuing an all-clear.
          </p>
          <form action={saveBlackoutAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="caps text-[11px] text-ink-3">Start</span>
              <input name="start" type="date" defaultValue={config.blackout?.start ?? ""} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="caps text-[11px] text-ink-3">End</span>
              <input name="end" type="date" defaultValue={config.blackout?.end ?? ""} className={INPUT} />
            </label>
            <input name="reason" required placeholder="Reason" className={cn(INPUT, "w-48")} />
            <button type="submit" className="pb-1 text-[12.5px] text-pos underline">
              Save
            </button>
          </form>
        </section>

        <section className="panel flex flex-col gap-2 p-3">
          <p className="panel-title">Coverage sectors</p>
          <p className="text-[12px] text-ink-3">
            IPS VI: the equity groups must at minimum cover these sectors. Anything a position maps to outside this
            list lands in &ldquo;Other&rdquo;, which still counts toward the sector cap.
          </p>
          <form action={saveCoverageSectorsAction} className="flex flex-col gap-2">
            <textarea
              name="sectors"
              rows={3}
              defaultValue={config.coverageSectors.join(", ")}
              className={cn(INPUT, "w-full")}
            />
            <div className="flex items-center gap-2">
              <input name="reason" required placeholder="Reason" className={cn(INPUT, "flex-1")} />
              <button type="submit" className="text-[12.5px] text-pos underline">
                Save
              </button>
            </div>
          </form>
        </section>
      </div>

      <TableShell
        title="Decision log"
        count={history.length}
        footer="Every configuration change, permanently. A limit that moved for no recorded reason is the one that cannot be defended to the Advisory Board."
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-3">
              <th className="px-2.5 py-1.5 font-medium">When</th>
              <th className="px-2.5 py-1.5 font-medium">Parameter</th>
              <th className="px-2.5 py-1.5 font-medium">From</th>
              <th className="px-2.5 py-1.5 font-medium">To</th>
              <th className="px-2.5 py-1.5 font-medium">Reason</th>
              <th className="px-2.5 py-1.5 font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[13px] text-ink-3">
                  No configuration changes yet. Every limit is at its IPS initial value.
                </td>
              </tr>
            )}
            {history.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-3">
                  {new Date(row.changed_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-2.5 py-1.5 text-[13px] text-ink">{row.key}</td>
                <td className="px-2.5 py-1.5 num text-[13px] text-ink-3">{row.old_value ?? "unset"}</td>
                <td className="px-2.5 py-1.5 num text-[13px] text-ink">{row.new_value}</td>
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-2">{row.reason}</td>
                <td className="px-2.5 py-1.5 text-[12.5px] text-ink-3">{row.changed_by_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
