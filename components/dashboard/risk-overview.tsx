"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme-colors";
import { fmtPct, fmtUsd, STATUS_TEXT } from "@/components/dashboard/risk-status";
import type { HeadlinePerformance, HistoryPoint } from "@/lib/risk-engine";
import type { Catalyst, CatalystFeed } from "@/lib/risk-catalysts";
import type { RiskStatus } from "@/lib/risk-parameters";

const AXIS = { fontSize: 11, fill: THEME.ink3 } as const;

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | null;
}) {
  return (
    <div className="flex flex-col justify-center px-3.5 py-2.5">
      <p className="caps text-[11px] text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[22px] font-semibold leading-none tabular-nums",
          tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-ink-3">{sub}</p>}
    </div>
  );
}

const toneOf = (v: number | null | undefined) => (v == null ? null : v >= 0 ? "pos" : "neg");
const signed = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;

/**
 * NAV and P&L, the figures a reader looks for before any limit.
 *
 * MTD and YTD read the stored NAV series, so they say how many trading days
 * they actually cover rather than implying a full period from a partial one.
 */
export function NavHeader({
  nav,
  performance,
  history,
}: {
  nav: number | null;
  performance: HeadlinePerformance | null;
  history: HistoryPoint[];
}) {
  const navSeries = history.filter((h) => h.nav != null).map((h) => ({ date: h.date, nav: h.nav as number }));

  return (
    <section className="panel flex flex-col">
      <div className="grid grid-cols-2 divide-x divide-line border-b border-line lg:grid-cols-4">
        <Tile label="Net asset value" value={fmtUsd(nav)} sub="Total fund size · IPS denominator" />
        <Tile
          label="Day P&L"
          value={fmtUsd(performance?.dayPnl)}
          sub={performance?.dayPnlPct != null ? signed(performance.dayPnlPct) : "—"}
          tone={toneOf(performance?.dayPnl)}
        />
        <Tile
          label="Month to date"
          value={signed(performance?.mtdPct)}
          sub={
            performance == null
              ? undefined
              : performance.mtdDays > 0
                ? `${performance.mtdDays} trading day${performance.mtdDays === 1 ? "" : "s"}`
                : "No stored NAV days yet"
          }
          tone={toneOf(performance?.mtdPct)}
        />
        <Tile
          label="Year to date"
          value={signed(performance?.ytdPct)}
          sub={
            performance == null
              ? undefined
              : performance.ytdDays > 0
                ? `${performance.ytdDays} trading day${performance.ytdDays === 1 ? "" : "s"}`
                : "No stored NAV days yet"
          }
          tone={toneOf(performance?.ytdPct)}
        />
      </div>

      <div className="h-36 p-3">
        {navSeries.length < 2 ? (
          <div className="flex h-full items-center justify-center text-center text-[12px] text-ink-3">
            The NAV chart fills in as daily snapshots accumulate. Paste the pre-go-live log into Risk Admin to
            backfill it.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={navSeries} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="navHeaderGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={THEME.garnet} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={THEME.garnet} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.line} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={44} />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={58}
                domain={["auto", "auto"]}
                tickFormatter={(v) => fmtUsd(Number(v), true)}
              />
              <Tooltip formatter={(v) => fmtUsd(Number(v))} contentStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="nav" stroke={THEME.garnet} fill="url(#navHeaderGrad)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

/**
 * Gross and net exposure over time, with the IPS II.c limits drawn on: the
 * 100% gross cap as a line, the 20–60% net band as a shaded region.
 */
export function ExposureHistoryChart({
  history,
  grossCap,
  netMin,
  netMax,
}: {
  history: HistoryPoint[];
  grossCap: number | null;
  netMin: number | null;
  netMax: number | null;
}) {
  const data = history
    .filter((h) => h.netPct != null || h.grossPct != null)
    .map((h) => ({ date: h.date, net: h.netPct, gross: h.grossPct }));

  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="panel-title">Exposure history</p>
        <p className="text-[11.5px] text-ink-3">
          {netMin != null && netMax != null ? `Net band ${netMin}–${netMax}%` : ""}
          {grossCap != null ? ` · Gross cap ${grossCap}%` : ""}
        </p>
      </div>
      <div className="h-52">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-center text-[12px] text-ink-3">
            Fills in as daily snapshots accumulate — one row is written each weekday at the close.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.line} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={44} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} unit="%" />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {netMin != null && netMax != null && (
                <ReferenceArea y1={netMin} y2={netMax} fill={THEME.pos} fillOpacity={0.07} stroke="none" />
              )}
              {grossCap != null && <ReferenceLine y={grossCap} stroke={THEME.neg} strokeDasharray="4 4" />}
              <Line name="Net" type="monotone" dataKey="net" stroke={THEME.garnet} strokeWidth={1.5} dot={false} connectNulls />
              <Line name="Gross" type="monotone" dataKey="gross" stroke={THEME.ink} strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

/**
 * Volatility against both bounds. Only the ceiling is an IPS limit; the floor
 * is the Risk Manager's, and sitting far below it is a sign capital is not
 * being deployed rather than a breach — so it is never coloured red.
 */
export function VolatilityCard({
  value,
  status,
  floor,
  cap,
  history,
  note,
}: {
  value: number | null;
  status: RiskStatus;
  floor: number | null;
  cap: number | null;
  history: HistoryPoint[];
  note: string | null;
}) {
  const series = history.filter((h) => h.volPct != null).map((h) => ({ date: h.date, vol: h.volPct as number }));
  const belowFloor = value != null && floor != null && value < floor;

  return (
    <section className="panel flex flex-col px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="caps text-[11px] text-ink-3">Annualized volatility</p>
        {cap != null && floor != null && (
          <p className="num text-[11px] text-ink-3">
            floor {floor}% · cap <span className="text-neg">{cap}%</span>
          </p>
        )}
      </div>

      <p className={cn("mt-1.5 text-[27px] font-semibold leading-none tabular-nums", STATUS_TEXT[status])}>
        {value == null ? "—" : fmtPct(value)}
      </p>

      {/* Where the reading sits between the two bounds, at a glance. */}
      {value != null && cap != null && (
        <div className="relative mt-2.5 h-[6px] bg-paper-2">
          {floor != null && (
            <div
              className="absolute inset-y-0 bg-pos opacity-25"
              style={{ left: `${(floor / (cap * 1.25)) * 100}%`, right: `${100 - (cap / (cap * 1.25)) * 100}%` }}
            />
          )}
          <div className="absolute inset-y-0 w-px bg-neg" style={{ left: `${(cap / (cap * 1.25)) * 100}%` }} />
          <div
            className="absolute -top-[2px] h-[10px] w-[2px] bg-ink"
            style={{ left: `${Math.min((value / (cap * 1.25)) * 100, 100)}%` }}
          />
        </div>
      )}

      <div className="mt-2 h-10">
        {series.length < 2 ? (
          <p className="text-[11px] text-ink-3">
            {note ?? "The trailing sparkline appears once stored volatility history exists."}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              {cap != null && <ReferenceLine y={cap} stroke={THEME.neg} strokeDasharray="2 2" />}
              {floor != null && <ReferenceLine y={floor} stroke={THEME.ink3} strokeDasharray="2 2" />}
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="vol" stroke={THEME.ink} strokeWidth={1.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {belowFloor && (
        <p className="mt-1 text-[11px] text-ink-3">
          Below the {floor}% floor — not a breach, but capital may be sitting idle.
        </p>
      )}
      {note && series.length >= 2 && <p className="mt-1 text-[11px] text-warn">{note}</p>}
    </section>
  );
}

const KIND_STYLE: Record<Catalyst["kind"], string> = {
  earnings: "bg-garnet-soft text-garnet border-garnet-line",
  macro: "bg-info-soft text-info border-info-line",
};

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Upcoming catalysts. Not a Wave 1 requirement — the Risk Manager's own ask,
 * on the reasoning that a board which only reports what already happened
 * cannot help anyone act before it does.
 */
export function CatalystPanel({ feed }: { feed: CatalystFeed }) {
  const byDate = new Map<string, Catalyst[]>();
  for (const item of feed.items) {
    byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  }

  return (
    <section className="panel flex flex-col p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="panel-title flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-ink-3" />
          Upcoming catalysts
        </p>
        <p className="text-[11.5px] text-ink-3">Next 30 days · holdings and US macro</p>
      </div>

      {byDate.size === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-ink-3">
          {feed.note ?? "Nothing scheduled."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {[...byDate.entries()].slice(0, 14).map(([date, items]) => (
            <li key={date} className="flex items-baseline gap-3 py-1.5">
              <span className="w-28 shrink-0 text-[12px] text-ink-2">{dayLabel(date)}</span>
              <span className="flex flex-wrap gap-1.5">
                {items.map((item) => (
                  <span
                    key={`${item.kind}:${item.label}`}
                    title={item.detail ?? undefined}
                    className={cn(
                      "inline-flex items-center gap-1 border px-1.5 py-[1px] text-[11.5px]",
                      KIND_STYLE[item.kind],
                    )}
                  >
                    {item.label}
                    {item.kind === "earnings" && <span className="opacity-70">earnings</span>}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
