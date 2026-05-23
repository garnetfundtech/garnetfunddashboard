"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Rss } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import type { FmpEarningRow } from "@/lib/fmp";

type EarningsFilter = "all" | "held" | "high";

function getWeekDays(): { label: string; short: string; date: Date }[] {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      label: d.toLocaleDateString("en-US", { weekday: "long" }),
      short: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      date: d,
    };
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function importanceTone(
  isHeld: boolean,
  isWatch: boolean,
): "high" | "med" | "low" {
  if (isHeld) return "high";
  if (isWatch) return "med";
  return "low";
}

const toneBorder: Record<string, string> = {
  high: "border-[var(--gf-accent)]/35 bg-[var(--gf-accent)]/[0.07]",
  med: "border-amber-400/20 bg-amber-400/[0.04]",
  low: "border-white/[0.06] bg-white/[0.02]",
};

function fmtEps(n: number | null) {
  if (n == null) return "—";
  return `${n >= 0 ? "" : "-"}$${Math.abs(n).toFixed(2)}`;
}

export function EarningsTableClient({
  rows,
  heldSet,
  watchSet,
}: {
  rows: FmpEarningRow[];
  heldSet: Set<string>;
  watchSet: Set<string>;
}) {
  const [filter, setFilter] = useState<EarningsFilter>("all");
  const weekDays = useMemo(() => getWeekDays(), []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const sym = r.symbol.toUpperCase();
      if (filter === "held") return heldSet.has(sym);
      if (filter === "high") return heldSet.has(sym) || watchSet.has(sym);
      return true;
    });
  }, [rows, filter, heldSet, watchSet]);

  const byDay = useMemo(() => {
    return weekDays.map(({ date }) => {
      const items = filtered.filter((r) => {
        try {
          // Parse as local date to avoid UTC offset shifting the day
          const [y, m, d] = r.date.split("-").map(Number);
          const localDate = new Date(y, m - 1, d);
          return isSameDay(localDate, date);
        } catch {
          return false;
        }
      });
      return items;
    });
  }, [filtered, weekDays]);

  const totalCount = rows.length;
  const heldCount = rows.filter((r) => heldSet.has(r.symbol.toUpperCase())).length;
  const highImpact = rows.filter(
    (r) =>
      heldSet.has(r.symbol.toUpperCase()) || watchSet.has(r.symbol.toUpperCase()),
  ).length;
  const bmoCount = 0;
  const amcCount = 0;

  const kpiTiles = [
    { label: "Events this week", value: String(totalCount), sub: "All companies" },
    { label: "Our holdings", value: String(heldCount), sub: "Garnet Fund positions" },
    { label: "High-impact", value: String(highImpact), sub: "Held + watchlist" },
    { label: "BMO", value: String(bmoCount), sub: "Before market open" },
    { label: "AMC", value: String(amcCount), sub: "After market close" },
  ];

  const weekLabel = `Week of ${weekDays[0]?.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[4]?.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Calendar"
        title="Earnings Week"
        subtitle="Reporting companies this week — our holdings plus key broad-market names."
        actions={
          <>
            <GhostBtn>
              <Rss className="h-3.5 w-3.5" />
              Subscribe
            </GhostBtn>
            <PrimaryBtn>
              <CalendarPlus className="h-3.5 w-3.5" />
              Add to calendar
            </PrimaryBtn>
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <div className="panel p-3">
        {/* Top strip */}
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
              {weekLabel}
            </p>
            <p className="text-[13.5px] font-semibold text-white">Calendar</p>
          </div>
          <FilterTabs
            options={[
              { value: "all", label: "All" },
              { value: "held", label: "Holdings only" },
              { value: "high", label: "High impact" },
            ] as { value: EarningsFilter; label: string }[]}
            value={filter}
            onChange={setFilter}
          />
        </div>

        {/* Day columns */}
        <div className="mt-3 grid gap-3 lg:grid-cols-5">
          {weekDays.map(({ short, label, date }, i) => {
            const items = byDay[i] ?? [];
            const isToday = isSameDay(date, new Date());

            return (
              <div key={label} className="flex flex-col gap-2">
                {/* Day header */}
                <div className="flex items-baseline justify-between pb-1.5 border-b border-white/[0.06]">
                  <div>
                    <p className={`text-[9.5px] uppercase tracking-[0.08em] ${isToday ? "text-[var(--gf-accent-fg)]" : "text-zinc-500"}`}>
                      {short}
                    </p>
                    <p className={`text-[13px] font-semibold ${isToday ? "text-white" : "text-zinc-300"}`}>
                      {date.getDate()}
                    </p>
                  </div>
                  <span className="tabular-nums text-[10px] text-zinc-600">
                    {items.length} ev
                  </span>
                </div>

                {/* Events */}
                {items.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-white/[0.05] px-2 py-3 text-center text-[11px] text-zinc-600">
                    No events
                  </div>
                ) : (
                  items.map((item) => {
                    const sym = item.symbol.toUpperCase();
                    const isHeld = heldSet.has(sym);
                    const isWatch = watchSet.has(sym);
                    const tone = importanceTone(isHeld, isWatch);

                    return (
                      <div
                        key={`${item.symbol}-${item.date}`}
                        className={`rounded-[8px] border p-2 ${toneBorder[tone]}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12.5px] font-semibold text-white">
                            {sym}
                          </span>
                          <span className={`rounded-[4px] px-1.5 py-[1px] text-[9px] font-semibold bg-white/[0.06] text-zinc-400`}>
                            {item.epsEstimated != null ? "EST" : "—"}
                          </span>
                        </div>
                        {item.name && item.name !== sym && (
                          <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                            {item.name}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-zinc-400">
                          <span className="text-zinc-500">EPS est </span>
                          <span className="tabular-nums text-zinc-200">
                            {fmtEps(item.epsEstimated)}
                          </span>
                        </p>
                        {item.eps != null && (
                          <p className="text-[10px] text-zinc-400">
                            <span className="text-zinc-500">Actual </span>
                            <span className={`tabular-nums ${item.eps >= (item.epsEstimated ?? 0) ? "text-emerald-400" : "text-rose-400"}`}>
                              {fmtEps(item.eps)}
                            </span>
                          </p>
                        )}
                        {isHeld && (
                          <span className="mt-1 inline-flex rounded-full border border-[var(--gf-accent)]/30 bg-[var(--gf-accent)]/10 px-1.5 py-[1px] text-[9px] font-medium text-[var(--gf-accent-fg)]">
                            Held
                          </span>
                        )}
                        {isWatch && !isHeld && (
                          <span className="mt-1 inline-flex rounded-full border border-amber-400/25 bg-amber-400/10 px-1.5 py-[1px] text-[9px] font-medium text-amber-400">
                            Watching
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
