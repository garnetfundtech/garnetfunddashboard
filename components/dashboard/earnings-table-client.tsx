"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Download } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn } from "@/components/dashboard/buttons";
import { StatusPill } from "@/components/dashboard/status-pill";
import { downloadIcs, googleCalendarUrl, type IcsEvent } from "@/lib/ics";
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
  high: "border-garnet-line bg-garnet-soft",
  med: "border-warn-line bg-warn-soft",
  low: "border-line bg-paper-3",
};

function fmtEps(n: number | null) {
  if (n == null) return "$XX.XX";
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
        title="Earnings Week"
        meta={weekLabel}
        actions={
          <GhostBtn
            onClick={() => {
              const events: IcsEvent[] = filtered.map((item) => ({
                uid: `${item.symbol}-${item.date}`,
                title: `${item.symbol.toUpperCase()} earnings`,
                date: item.date,
                description: item.name,
              }));
              downloadIcs(events, "Garnet Fund Earnings", "garnet-fund-earnings.ics");
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Download .ics
          </GhostBtn>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <div className="panel p-3">
        {/* Top strip */}
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
              {weekLabel}
            </p>
            <p className="text-[15px] font-semibold text-ink">Calendar</p>
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
                <div className="flex items-baseline justify-between pb-1.5 border-b border-line">
                  <div>
                    <p className={`text-[12px] uppercase tracking-[0.08em] ${isToday ? "text-garnet" : "text-ink-3"}`}>
                      {short}
                    </p>
                    <p className={`text-[14.5px] font-semibold ${isToday ? "text-ink" : "text-ink"}`}>
                      {date.getDate()}
                    </p>
                  </div>
                  <span className="tabular-nums text-[11px] text-ink-3">
                    {items.length} ev
                  </span>
                </div>

                {/* Events */}
                {items.length === 0 ? (
                  <div className="rounded-none border border-dashed border-line px-2 py-3 text-center text-[13px] text-ink-3">
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
                        className={`rounded-none border p-2 ${toneBorder[tone]}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[14px] font-semibold text-ink">
                            {sym}
                          </span>
                          <div className="flex items-center gap-1">
                            {item.epsEstimated != null && <StatusPill label="EST" tone="neutral" dot={false} />}
                            <a
                              href={googleCalendarUrl({
                                uid: `${item.symbol}-${item.date}`,
                                title: `${sym} earnings`,
                                date: item.date,
                                description: item.name,
                              })}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Add to Google Calendar"
                              className="text-ink-3 transition-colors hover:text-ink"
                            >
                              <CalendarPlus className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                        {item.name && item.name !== sym && (
                          <p className="mt-0.5 truncate text-[11px] text-ink-3">
                            {item.name}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-ink-2">
                          <span className="text-ink-3">EPS est </span>
                          <span className="tabular-nums text-ink">
                            {fmtEps(item.epsEstimated)}
                          </span>
                        </p>
                        {item.eps != null && (
                          <p className="text-[11px] text-ink-2">
                            <span className="text-ink-3">Actual </span>
                            <span className={`tabular-nums ${item.eps >= (item.epsEstimated ?? 0) ? "text-pos" : "text-neg"}`}>
                              {fmtEps(item.eps)}
                            </span>
                          </p>
                        )}
                        {isHeld && (
                          <span className="mt-1 inline-flex">
                            <StatusPill label="Held" tone="accent" dot={false} />
                          </span>
                        )}
                        {isWatch && !isHeld && (
                          <span className="mt-1 inline-flex">
                            <StatusPill label="Watching" tone="amber" dot={false} />
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
