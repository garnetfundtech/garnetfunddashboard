"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/dashboard/status-pill";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useClickOutside } from "@/lib/use-click-outside";
import type {
  RiskModel,
  EvaluatedRow,
  BookSummary,
  SectorBalanceRow,
  VarView,
  StressScenarioView,
} from "@/lib/risk-engine";
import type { RiskStatus } from "@/lib/risk-parameters";
import { CADENCE_LABEL } from "@/lib/risk-parameters";

const STATUS_TEXT: Record<RiskStatus, string> = {
  green: "text-pos",
  yellow: "text-warn",
  red: "text-neg",
  na: "text-ink-3",
};

const STATUS_DOT: Record<RiskStatus, string> = {
  green: "bg-pos",
  yellow: "bg-warn",
  red: "bg-neg",
  na: "bg-ink-3",
};

const STATUS_LABEL: Record<RiskStatus, string> = {
  green: "In policy",
  yellow: "Watch",
  red: "Breach",
  na: "No data",
};

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${n < 0 ? "−" : ""}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${n < 0 ? "−" : ""}$${(abs / 1e3).toFixed(0)}K`;
  return `${n < 0 ? "−" : ""}$${abs.toFixed(0)}`;
}

// ── Headline neutrality tiles ─────────────────────────────────────────────

function HeadlineTile({ row, caption }: { row: EvaluatedRow; caption: string }) {
  return (
    <article className="panel relative overflow-hidden px-3.5 py-3">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            row.status === "green"
              ? "var(--pos)"
              : row.status === "yellow"
                ? "var(--warn)"
                : row.status === "red"
                  ? "var(--neg)"
                  : "var(--line-2)",
        }}
      />
      <div className="flex items-center justify-between">
        <p className="caps text-[11px] text-ink-3">{row.limit.label}</p>
        <StatusChip status={row.status} />
      </div>
      <p className={cn("mt-1 text-[29px] font-semibold leading-none tabular-nums", STATUS_TEXT[row.status])}>
        {row.display}
      </p>
      <p className="mt-1.5 text-[12px] text-ink-3">
        <span className="text-ink-2">Target</span> {row.limit.target}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-3">{caption}</p>
    </article>
  );
}

function StatusChip({ status }: { status: RiskStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-none", STATUS_DOT[status])} />
      <span className={cn("text-[11px] font-medium", STATUS_TEXT[status])}>{STATUS_LABEL[status]}</span>
    </span>
  );
}

// ── Book summary cards ────────────────────────────────────────────────────

function BookCard({ book, title }: { book: BookSummary | null; title: string }) {
  const accent = title.startsWith("Long") ? "text-pos" : "text-neg";
  return (
    <article className="panel flex flex-col gap-2 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <p className="caps text-[11px] text-ink-3">{title}</p>
        <span className={cn("text-[13.5px] font-semibold tabular-nums", accent)}>
          {book ? `${book.grossPct.toFixed(1)}%` : "XX.X%"}
        </span>
      </div>
      {book && book.count > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Names" value={String(book.count)} />
          <Stat label="Eff. bets" value={book.effectiveBets != null ? book.effectiveBets.toFixed(1) : "X.X"} />
          <Stat
            label="Largest"
            value={book.largest ? `${book.largest.weight.toFixed(1)}%` : "XX.X%"}
            sub={book.largest?.ticker}
          />
        </div>
      ) : (
        <p className="py-2 text-[12.5px] text-ink-3">No {title.toLowerCase()} positions.</p>
      )}
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[12px] uppercase tracking-wider text-ink-3">{label}</p>
      <p className="text-[15.5px] font-semibold tabular-nums text-ink leading-tight">{value}</p>
      {sub && <p className="text-[12px] tabular-nums text-ink-3">{sub}</p>}
    </div>
  );
}

// ── Sector long-vs-short balance ──────────────────────────────────────────

function SectorBalance({ rows }: { rows: SectorBalanceRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.longPct, r.shortPct)));
  const gapTone = (gap: number) =>
    gap <= 3.5 ? "text-pos" : gap <= 5 ? "text-warn" : "text-neg";

  return (
    <article className="panel flex flex-col px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="caps text-[11px] text-ink-3">Sector Balance · Long vs Short</p>
        <span className="text-[11px] text-ink-3">gap target ±5%</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && <p className="text-[12.5px] text-ink-3">No positions.</p>}
        {rows.map((r) => (
          <div key={r.sector} className="flex items-center gap-2">
            <span className="w-[112px] shrink-0 truncate text-[12.5px] text-ink">{r.sector}</span>
            {/* short bar (left) */}
            <div className="flex flex-1 items-center justify-end">
              <span className="tabular-nums text-[12px] text-neg">{r.shortPct.toFixed(1)}</span>
              <div className="ml-1 h-2 w-[46%] overflow-hidden rounded-none bg-paper-3">
                <div
                  className="ml-auto h-full rounded-none bg-neg"
                  style={{ width: `${(r.shortPct / max) * 100}%` }}
                />
              </div>
            </div>
            <div className="h-3 w-px shrink-0 bg-paper-2" />
            {/* long bar (right) */}
            <div className="flex flex-1 items-center">
              <div className="mr-1 h-2 w-[46%] overflow-hidden rounded-none bg-paper-3">
                <div
                  className="h-full rounded-none bg-pos"
                  style={{ width: `${(r.longPct / max) * 100}%` }}
                />
              </div>
              <span className="tabular-nums text-[12px] text-pos">{r.longPct.toFixed(1)}</span>
            </div>
            <span className={cn("w-[42px] shrink-0 text-right tabular-nums text-[12px] font-medium", gapTone(r.gapPct))}>
              {r.gapPct.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

// ── VaR / CVaR ────────────────────────────────────────────────────────────

function VarPanel({ v }: { v: VarView | null }) {
  if (!v || (v.var95 == null && v.cvar95 == null)) return null;
  const ratio = v.varRatio;
  const ratioTone = ratio == null ? "na" : ratio <= 0.5 ? "green" : ratio <= 0.75 ? "yellow" : "red";
  const fmt = (n: number | null) => (n == null ? "XX.XX%" : `${n.toFixed(2)}%`);

  return (
    <article className="panel flex flex-col px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="caps text-[11px] text-ink-3">Value at Risk · 95% (daily)</p>
        <span className="text-[11px] text-ink-3">historical simulation</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="95% VaR" value={fmt(v.var95)} />
        <Stat label="95% CVaR" value={fmt(v.cvar95)} />
        <Stat label="Long-only VaR" value={fmt(v.longOnlyVar95)} sub="if unhedged" />
      </div>
      {ratio != null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-ink-3">
              Hedge ratio
            </span>
            <span className={cn("text-[12.5px] font-semibold tabular-nums", STATUS_TEXT[ratioTone])}>
              {(ratio * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-none bg-paper-2">
            <div
              className={cn(
                "h-full rounded-none",
                ratioTone === "green" ? "bg-pos" : ratioTone === "yellow" ? "bg-warn" : "bg-neg",
              )}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-3">
            {ratioTone === "red"
              ? "VaR is approaching a long-only book. Neutrality has drifted."
              : "Well below a long-only book. The hedge is working."}
          </p>
        </div>
      )}
    </article>
  );
}

// ── Stress tests ──────────────────────────────────────────────────────────

function StressPanel({ scenarios, worst }: { scenarios: StressScenarioView[]; worst: StressScenarioView | null }) {
  if (!scenarios.length) return null;
  const maxMag = Math.max(10, ...scenarios.map((s) => Math.abs(s.pnlPct)));
  const breach = worst != null && worst.pnlPct < -10;

  return (
    <article className="panel flex flex-col px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="caps text-[11px] text-ink-3">Stress Tests · quarterly</p>
        <span className={cn("text-[11px]", breach ? "text-neg" : "text-ink-3")}>
          loss cap 10% NAV
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {scenarios.map((s) => {
          const loss = s.pnlPct < 0;
          const flagged = s.pnlPct < -10;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className="flex w-[150px] shrink-0 items-start gap-1">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] text-ink">{s.label}</p>
                  <p className="truncate text-[12px] text-ink-3">{s.description}</p>
                </div>
                <InfoTooltip text={`${s.label}: ${s.description}`} />
              </div>
              {/* center baseline: losses extend left (red), gains right (green) */}
              <div className="flex flex-1 items-center">
                <div className="flex h-2.5 w-1/2 justify-end overflow-hidden rounded-none bg-paper-3">
                  {loss && (
                    <div
                      className={cn("h-full rounded-none", flagged ? "bg-neg" : "bg-neg")}
                      style={{ width: `${(Math.abs(s.pnlPct) / maxMag) * 100}%` }}
                    />
                  )}
                </div>
                <div className="h-3 w-px shrink-0 bg-paper-2" />
                <div className="flex h-2.5 w-1/2 overflow-hidden rounded-none bg-paper-3">
                  {!loss && (
                    <div
                      className="h-full rounded-none bg-pos"
                      style={{ width: `${(Math.abs(s.pnlPct) / maxMag) * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "w-[52px] shrink-0 text-right text-[13px] font-semibold tabular-nums",
                  flagged ? "text-neg" : loss ? "text-neg" : "text-pos",
                )}
              >
                {s.pnlPct >= 0 ? "+" : "−"}
                {Math.abs(s.pnlPct).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
      {breach && worst && (
        <p className="mt-2 text-[12px] text-neg">
          {worst.label} breaches the −10% NAV covenant line ({worst.pnlPct.toFixed(1)}%).
        </p>
      )}
    </article>
  );
}

// ── Limits table ──────────────────────────────────────────────────────────

function LimitRow({ row }: { row: EvaluatedRow }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="py-1.5 pr-2">
        <span className="text-[13.5px] text-ink">{row.limit.label}</span>
        {row.limit.note && <InfoTooltip text={row.limit.note} />}
      </td>
      <td className={cn("py-1.5 pr-2 text-right tabular-nums text-[14px] font-semibold", STATUS_TEXT[row.status])}>
        {row.display}
      </td>
      <td className="hidden py-1.5 pr-2 text-[12.5px] text-ink-3 sm:table-cell">{row.limit.target}</td>
      <td className="hidden py-1.5 pr-2 text-[12px] text-ink-3 md:table-cell">
        {CADENCE_LABEL[row.limit.cadence]}
      </td>
      <td className="py-1.5 text-right">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-none", STATUS_DOT[row.status])} />
          <span className={cn("hidden text-[12px] font-medium sm:inline", STATUS_TEXT[row.status])}>
            {STATUS_LABEL[row.status]}
          </span>
        </span>
      </td>
    </tr>
  );
}

function LimitGroup({
  label,
  blurb,
  rows,
}: {
  label: string;
  blurb: string;
  rows: EvaluatedRow[];
}) {
  return (
    <section className="panel px-3.5 py-3">
      <div className="mb-1.5">
        <h3 className="text-[14.5px] font-semibold text-ink">{label}</h3>
        <p className="text-[12px] text-ink-3">{blurb}</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-1 pr-2 text-[12px] font-medium uppercase tracking-wider text-ink-3">Metric</th>
            <th className="py-1 pr-2 text-right text-[12px] font-medium uppercase tracking-wider text-ink-3">Current</th>
            <th className="hidden py-1 pr-2 text-[12px] font-medium uppercase tracking-wider text-ink-3 sm:table-cell">Target</th>
            <th className="hidden py-1 pr-2 text-[12px] font-medium uppercase tracking-wider text-ink-3 md:table-cell">Cadence</th>
            <th className="py-1 text-right text-[12px] font-medium uppercase tracking-wider text-ink-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <LimitRow key={r.limit.id} row={r} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ── Breach banner ─────────────────────────────────────────────────────────

function BreachBanner({ breaches }: { breaches: EvaluatedRow[] }) {
  if (breaches.length === 0) return null;
  return (
    <div className="rounded-none border border-neg-line bg-neg-soft px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-none bg-neg" />
        <p className="text-[13.5px] font-semibold text-neg">
          {breaches.length} limit{breaches.length > 1 ? "s" : ""} breached. Flag in writing within 24h; rebalance drift breaches within 2 trading days.
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-3.5">
        {breaches.map((b) => (
          <span key={b.limit.id} className="text-[12.5px] text-neg">
            {b.limit.label}: <span className="font-semibold tabular-nums">{b.display}</span>
            <span className="text-neg"> (target {b.limit.target})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────

export function RiskMonitor({ model }: { model: RiskModel }) {
  const allRows = model.groups.flatMap((g) => g.rows);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header / legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {model.source !== "live" && <StatusPill label="Sample book" tone="blue" />}
          {model.nav != null && (
            <span className="text-[12.5px] text-ink-3">
              NAV <span className="tabular-nums text-ink">{fmtCompact(model.nav)}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12.5px] tabular-nums">
          <LegendCount dot="bg-pos" n={model.counts.green} label="in policy" status="green" rows={allRows} />
          <LegendCount dot="bg-warn" n={model.counts.yellow} label="watch" status="yellow" rows={allRows} />
          <LegendCount dot="bg-neg" n={model.counts.red} label="breach" status="red" rows={allRows} />
          <LegendCount dot="bg-ink-3" n={model.counts.na} label="pending" status="na" rows={allRows} />
        </div>
      </div>

      {model.source === "sample" && (
        <p className="rounded-none border border-info-line bg-info-soft px-3 py-1.5 text-[12.5px] text-info">
          Illustrative long/short book for demo purposes. The in-app Risk Monitor always shows the real account.
        </p>
      )}

      <BreachBanner breaches={model.breaches} />

      {/* Neutrality headline */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HeadlineTile row={model.headline.net} caption="Longs − shorts · drifts daily" />
        <HeadlineTile row={model.headline.gross} caption="Longs + shorts · 75 / 75 target" />
        <HeadlineTile row={model.headline.beta} caption="Weekly regression vs S&P 500" />
      </div>

      {/* Books, sector balance, VaR, and stress tests — one row so nothing
          is left stranded with empty space beside it. */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        <BookCard book={model.longBook} title="Long Book" />
        <BookCard book={model.shortBook} title="Short Book" />
        <SectorBalance rows={model.sectorBalance.slice(0, 8)} />
        <VarPanel v={model.varView} />
        <StressPanel scenarios={model.stress} worst={model.worstStress} />
      </div>

      {/* Full limits table */}
      <div className="grid gap-3 xl:grid-cols-2">
        {model.groups.map((g) => (
          <LimitGroup key={g.group} label={g.label} blurb={g.blurb} rows={g.rows} />
        ))}
      </div>
    </div>
  );
}

function LegendCount({
  dot,
  n,
  label,
  status,
  rows,
}: {
  dot: string;
  n: number;
  label: string;
  status: RiskStatus;
  rows: EvaluatedRow[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useClickOutside(ref, open, () => setOpen(false));
  const matches = rows.filter((r) => r.status === status);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center gap-1.5 text-ink-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn("h-1.5 w-1.5 rounded-none", dot)} />
        <span className="font-semibold text-ink">{n}</span>
        <span className="hidden text-ink-3 md:inline">{label}</span>
      </button>
      {open && n > 0 && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-72 border border-line-2 bg-surface py-1.5 shadow-[0_2px_8px_rgba(23,24,26,0.12)]">
          <p className="border-b border-line px-3 pb-1.5 text-[11px] uppercase tracking-wider text-ink-3">
            {label} · {n}
          </p>
          <ul className="max-h-64 overflow-y-auto">
            {matches.map((r) => (
              <li key={r.limit.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px]">
                <span className="text-ink">{r.limit.label}</span>
                <span className={cn("tabular-nums font-medium", STATUS_TEXT[r.status])}>{r.display}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
