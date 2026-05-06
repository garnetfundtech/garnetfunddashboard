"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FredObservation } from "@/lib/fred";
import { cn } from "@/lib/utils";

export type MacroSeriesMap = Record<string, FredObservation[]>;

function ChartBlock({
  title,
  subtitle,
  data,
  color,
  valueFmt,
}: {
  title: string;
  subtitle: string;
  data: { date: string; value: number }[];
  color: string;
  valueFmt: (v: number) => string;
}) {
  const RANGES = ["1Y", "5Y", "10Y", "20Y", "MAX"] as const;
  type Range = (typeof RANGES)[number];
  const [range, setRange] = useState<Range>("10Y");

  const sliced = useMemo(() => {
    if (range === "MAX") return data;
    const years = Number(range.replace("Y", ""));
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return data.filter((d) => new Date(`${d.date}-01`).getTime() >= cutoff.getTime());
  }, [data, range]);

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="caps-label">{subtitle}</p>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        <div className="flex items-center gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-[7px] px-2 py-1 text-xs font-medium transition-colors",
                r === range ? "bg-white/10 text-white" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 h-[220px]">
        {sliced.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sliced} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2329" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#52525b", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(sliced.length / 6)}
              />
              <YAxis tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} width={40} tickFormatter={valueFmt} />
              <Tooltip
                contentStyle={{ background: "#0c0d0f", border: "1px solid #27272a", borderRadius: 8 }}
                formatter={(v) => [valueFmt(Number(v)), title]}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-zinc-500">No data (check FRED_API_KEY).</p>
        )}
      </div>
    </section>
  );
}

function clean(series: FredObservation[] | undefined) {
  if (!series) return [];
  return series
    .filter((o) => o.value != null && Number.isFinite(o.value))
    .map((o) => ({ date: o.date.slice(0, 7), value: o.value as number }));
}

export function MacroPageClient({ series }: { series: MacroSeriesMap }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [briefAt, setBriefAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="caps-label">AI</p>
            <h2 className="text-sm font-semibold text-white">Macro briefing</h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              {briefAt ? `Generated ${new Date(briefAt).toLocaleString()}` : "Not generated yet"}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await fetch("/api/gemini/macro-brief", { method: "POST" });
                const json = (await res.json()) as { ok?: boolean; briefing?: string; generatedAt?: string; message?: string };
                if (json.ok && json.briefing) {
                  setBrief(json.briefing);
                  setBriefAt(json.generatedAt ?? new Date().toISOString());
                } else {
                  setBrief(json.message ?? "Could not generate briefing.");
                }
              });
            }}
            className="rounded-[10px] bg-[#8e0604] px-3 py-2 text-xs font-medium text-white hover:bg-[#a80705] disabled:opacity-50"
          >
            {pending ? "Generating…" : "Generate briefing"}
          </button>
        </div>
        {brief ? <p className="mt-3 text-sm leading-relaxed text-zinc-200">{brief}</p> : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartBlock
          title="10Y − 2Y Treasury spread"
          subtitle="Yield curve"
          data={clean(series?.T10Y2Y)}
          color="#f87171"
          valueFmt={(v) => `${v.toFixed(2)}%`}
        />
        <ChartBlock
          title="CPI (year-over-year)"
          subtitle="Inflation"
          data={clean(series?.CPI_YOY)}
          color="#fb923c"
          valueFmt={(v) => `${v.toFixed(2)}%`}
        />
        <ChartBlock
          title="Core PCE (index level)"
          subtitle="Prices"
          data={clean(series?.PCEPILFE)}
          color="#a78bfa"
          valueFmt={(v) => v.toFixed(1)}
        />
        <ChartBlock
          title="Effective federal funds rate"
          subtitle="Policy"
          data={clean(series?.DFF)}
          color="#38bdf8"
          valueFmt={(v) => `${v.toFixed(2)}%`}
        />
        <ChartBlock
          title="Unemployment rate"
          subtitle="Labor"
          data={clean(series?.UNRATE)}
          color="#4ade80"
          valueFmt={(v) => `${v.toFixed(2)}%`}
        />
      </div>
    </div>
  );
}
