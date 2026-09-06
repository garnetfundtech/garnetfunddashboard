"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { fmtPct, fmtUsd } from "@/components/dashboard/risk-status";
import type { PositionRow } from "@/lib/risk-engine";

type SortKey = "Size" | "Team" | "Sector";

const TEAM_COLOR: Record<string, string> = {
  equities: "var(--garnet)",
  alternatives: "var(--info)",
};

/**
 * Position sizes as a diverging horizontal bar chart — longs right of the
 * centre line, shorts left, coloured by team, with the IPS position caps drawn
 * as vertical rules.
 *
 * A bar rather than a pie, deliberately: a pie cannot render a short at all
 * (there is no negative slice), and it cannot carry the 10% and 5% cap lines,
 * which are the only reason to look at position sizes on a risk board.
 *
 * Hand-drawn rather than pulled from the chart library because the axis is
 * two-sided with asymmetric limits on each side — 10% for a long, 5% for a
 * short — which is a layout no stock bar chart expresses.
 */
export function PositionSizeChart({
  rows,
  longCap,
  shortCap,
}: {
  rows: PositionRow[];
  longCap: number | null;
  shortCap: number | null;
}) {
  const [sort, setSort] = useState<SortKey>("Size");

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "Size") return list.sort((a, b) => b.position.weightPct - a.position.weightPct);
    if (sort === "Team") {
      return list.sort(
        (a, b) =>
          a.position.team.localeCompare(b.position.team) || b.position.weightPct - a.position.weightPct,
      );
    }
    return list.sort(
      (a, b) => a.position.sector.localeCompare(b.position.sector) || b.position.weightPct - a.position.weightPct,
    );
  }, [rows, sort]);

  // The axis has to reach past the caps, or a breach would be drawn inside the
  // limit line it broke.
  const widest = Math.max(...rows.map((r) => r.position.weightPct), longCap ?? 0, shortCap ?? 0, 1);
  const axisMax = Math.ceil((widest * 1.15) / 5) * 5;
  const toPct = (weight: number) => (weight / axisMax) * 50;

  const top5 = [...rows]
    .sort((a, b) => b.position.weightPct - a.position.weightPct)
    .slice(0, 5)
    .reduce((sum, r) => sum + r.position.weightPct, 0);

  const capLeft = shortCap != null ? 50 - toPct(shortCap) : null;
  const capRight = longCap != null ? 50 + toPct(longCap) : null;

  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <p className="panel-title">Position sizes</p>
          <p className="text-[12px] text-ink-3">
            <span className="num text-[15px] font-semibold text-ink">{fmtPct(top5)}</span> in the top 5
          </p>
        </div>
        <FilterTabs options={["Size", "Team", "Sector"] as SortKey[]} value={sort} onChange={setSort} />
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-3">No positions to chart.</p>
      ) : (
        <>
          <div className="relative">
            {/* Cap lines and the zero axis, drawn behind the bars. */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-y-0 w-px bg-line-2" style={{ left: "50%" }} />
              {capRight != null && (
                <div className="absolute inset-y-0 w-px bg-neg opacity-60" style={{ left: `${capRight}%` }} />
              )}
              {capLeft != null && (
                <div className="absolute inset-y-0 w-px bg-neg opacity-60" style={{ left: `${capLeft}%` }} />
              )}
            </div>

            <ul className="relative flex flex-col gap-[3px]">
              {sorted.map((row) => {
                const p = row.position;
                const isLong = p.side === "long";
                const width = toPct(p.weightPct);
                const breached = row.rules[isLong ? "long-size" : "short-size"].status === "red";
                return (
                  <li key={p.symbol} className="group relative flex h-[18px] items-center">
                    <div
                      className={cn(
                        "absolute h-[11px] transition-opacity group-hover:opacity-80",
                        breached && "outline outline-1 outline-neg",
                      )}
                      style={{
                        background: TEAM_COLOR[p.team] ?? "var(--ink-3)",
                        left: isLong ? "50%" : `${50 - width}%`,
                        width: `${Math.max(width, 0.15)}%`,
                      }}
                    />
                    <span
                      className="absolute text-[11px] text-ink-2"
                      style={
                        isLong
                          ? { left: `calc(50% + ${width}% + 6px)` }
                          : { right: `calc(50% + ${width}% + 6px)` }
                      }
                    >
                      {p.symbol} <span className="num text-ink-3">{fmtPct(p.weightPct, 2)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-2 text-[11px] text-ink-3">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2" style={{ background: TEAM_COLOR.equities }} /> Equities
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2" style={{ background: TEAM_COLOR.alternatives }} /> Alternatives
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-px bg-neg" /> IPS cap
              </span>
            </span>
            <span>
              ← shorts {shortCap != null ? `(cap ${shortCap}%)` : ""} · longs {longCap != null ? `(cap ${longCap}%)` : ""} →
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Sector gross exposure against the IPS VI cap. Same visual language as the
 * position chart so the two read as one family, but single-sided: gross
 * exposure per sector is an absolute, never negative.
 */
export function SectorGrossChart({
  rows,
  cap,
}: {
  rows: { sector: string; grossPct: number; grossUsd: number; count: number }[];
  cap: number | null;
}) {
  const widest = Math.max(...rows.map((r) => r.grossPct), cap ?? 0, 1);
  const axisMax = Math.ceil((widest * 1.15) / 5) * 5;
  const visible = rows.filter((r) => r.grossPct > 0 || r.count > 0);

  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="panel-title">Sector gross exposure</p>
        <p className="text-[11.5px] text-ink-3">{cap != null ? `Cap ${cap}% of NAV` : "No cap set"}</p>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-3">No Equities-book positions to chart.</p>
      ) : (
        <div className="relative">
          {cap != null && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-neg opacity-60"
              style={{ left: `${(cap / axisMax) * 100}%` }}
            />
          )}
          <ul className="relative flex flex-col gap-1">
            {visible.map((r) => (
              <li key={r.sector} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-[12px] text-ink-2">{r.sector}</span>
                <span className="relative h-[13px] flex-1">
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0",
                      cap != null && r.grossPct > cap ? "bg-neg" : "bg-garnet",
                    )}
                    style={{ width: `${Math.max((r.grossPct / axisMax) * 100, 0.2)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right num text-[12px] text-ink">{fmtPct(r.grossPct)}</span>
                <span className="w-20 shrink-0 text-right num text-[11.5px] text-ink-3">
                  {fmtUsd(r.grossUsd, true)}
                </span>
                <span className="w-6 shrink-0 text-right num text-[11.5px] text-ink-3">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
