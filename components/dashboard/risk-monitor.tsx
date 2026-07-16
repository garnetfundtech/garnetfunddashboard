import { cn } from "@/lib/utils";
import type {
  RiskModel,
  EvaluatedRow,
  BookSummary,
  SectorBalanceRow,
  VarView,
  StressScenarioView,
} from "@/lib/risk-engine";
import type { RiskStatus, RiskDataSource } from "@/lib/risk-parameters";
import { CADENCE_LABEL } from "@/lib/risk-parameters";

const STATUS_TEXT: Record<RiskStatus, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-300",
  red: "text-rose-400",
  na: "text-zinc-500",
};

const STATUS_DOT: Record<RiskStatus, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-300",
  red: "bg-rose-400",
  na: "bg-zinc-600",
};

const STATUS_LABEL: Record<RiskStatus, string> = {
  green: "In policy",
  yellow: "Watch",
  red: "Breach",
  na: "No data",
};

const SOURCE_LABEL: Record<RiskDataSource, string> = {
  live: "Live",
  sample: "Sample",
  manual: "Manual",
  planned: "Phase 2",
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
              ? "#34d399"
              : row.status === "yellow"
                ? "#fbbf24"
                : row.status === "red"
                  ? "#fb7185"
                  : "#3f3f46",
        }}
      />
      <div className="flex items-center justify-between">
        <p className="caps text-[10px] text-zinc-500">{row.limit.label}</p>
        <StatusChip status={row.status} />
      </div>
      <p className={cn("mt-1 text-[26px] font-semibold leading-none tabular-nums", STATUS_TEXT[row.status])}>
        {row.display}
      </p>
      <p className="mt-1.5 text-[10.5px] text-zinc-500">
        <span className="text-zinc-400">Target</span> {row.limit.target}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-600">{caption}</p>
    </article>
  );
}

function StatusChip({ status }: { status: RiskStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      <span className={cn("text-[10px] font-medium", STATUS_TEXT[status])}>{STATUS_LABEL[status]}</span>
    </span>
  );
}

// ── Book summary cards ────────────────────────────────────────────────────

function BookCard({ book, title }: { book: BookSummary | null; title: string }) {
  const accent = title.startsWith("Long") ? "text-emerald-400" : "text-rose-400";
  return (
    <article className="panel flex flex-col gap-2 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <p className="caps text-[10px] text-zinc-500">{title}</p>
        <span className={cn("text-[12px] font-semibold tabular-nums", accent)}>
          {book ? `${book.grossPct.toFixed(1)}%` : "—"}
        </span>
      </div>
      {book && book.count > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Names" value={String(book.count)} />
          <Stat label="Eff. bets" value={book.effectiveBets != null ? book.effectiveBets.toFixed(1) : "—"} />
          <Stat
            label="Largest"
            value={book.largest ? `${book.largest.weight.toFixed(1)}%` : "—"}
            sub={book.largest?.ticker}
          />
        </div>
      ) : (
        <p className="py-2 text-[11px] text-zinc-600">No {title.toLowerCase()} positions.</p>
      )}
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="text-[14px] font-semibold tabular-nums text-white leading-tight">{value}</p>
      {sub && <p className="text-[9.5px] tabular-nums text-zinc-500">{sub}</p>}
    </div>
  );
}

// ── Sector long-vs-short balance ──────────────────────────────────────────

function SectorBalance({ rows }: { rows: SectorBalanceRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.longPct, r.shortPct)));
  const gapTone = (gap: number) =>
    gap <= 3.5 ? "text-emerald-400" : gap <= 5 ? "text-amber-300" : "text-rose-400";

  return (
    <article className="panel flex flex-col px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="caps text-[10px] text-zinc-500">Sector Balance · Long vs Short</p>
        <span className="text-[10px] text-zinc-600">gap target ±5%</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && <p className="text-[11px] text-zinc-600">No positions.</p>}
        {rows.map((r) => (
          <div key={r.sector} className="flex items-center gap-2">
            <span className="w-[112px] shrink-0 truncate text-[11px] text-zinc-300">{r.sector}</span>
            {/* short bar (left) */}
            <div className="flex flex-1 items-center justify-end">
              <span className="tabular-nums text-[9.5px] text-rose-400/70">{r.shortPct.toFixed(1)}</span>
              <div className="ml-1 h-2 w-[46%] overflow-hidden rounded-sm bg-white/[0.02]">
                <div
                  className="ml-auto h-full rounded-sm bg-rose-400/60"
                  style={{ width: `${(r.shortPct / max) * 100}%` }}
                />
              </div>
            </div>
            <div className="h-3 w-px shrink-0 bg-white/10" />
            {/* long bar (right) */}
            <div className="flex flex-1 items-center">
              <div className="mr-1 h-2 w-[46%] overflow-hidden rounded-sm bg-white/[0.02]">
                <div
                  className="h-full rounded-sm bg-emerald-400/60"
                  style={{ width: `${(r.longPct / max) * 100}%` }}
                />
              </div>
              <span className="tabular-nums text-[9.5px] text-emerald-400/70">{r.longPct.toFixed(1)}</span>
            </div>
            <span className={cn("w-[42px] shrink-0 text-right tabular-nums text-[10.5px] font-medium", gapTone(r.gapPct))}>
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
  const fmt = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);

  return (
    <article className="panel flex flex-col px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="caps text-[10px] text-zinc-500">Value at Risk · 95% (daily)</p>
        <span className="text-[10px] text-zinc-600">historical simulation</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="95% VaR" value={fmt(v.var95)} />
        <Stat label="95% CVaR" value={fmt(v.cvar95)} />
        <Stat label="Long-only VaR" value={fmt(v.longOnlyVar95)} sub="if unhedged" />
      </div>
      {ratio != null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">
              Neutrality (VaR ÷ long-only VaR)
            </span>
            <span className={cn("text-[11px] font-semibold tabular-nums", STATUS_TEXT[ratioTone])}>
              {(ratio * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-sm bg-white/[0.04]">
            <div
              className={cn(
                "h-full rounded-sm",
                ratioTone === "green" ? "bg-emerald-400/70" : ratioTone === "yellow" ? "bg-amber-300/70" : "bg-rose-400/70",
              )}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            {ratioTone === "red"
              ? "VaR is approaching a long-only book — neutrality has drifted."
              : "Well below a long-only book — the hedge is working."}
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
        <p className="caps text-[10px] text-zinc-500">Stress Tests · quarterly</p>
        <span className={cn("text-[10px]", breach ? "text-rose-400" : "text-zinc-600")}>
          loss cap 10% NAV
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {scenarios.map((s) => {
          const loss = s.pnlPct < 0;
          const flagged = s.pnlPct < -10;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className="w-[130px] shrink-0">
                <p className="truncate text-[11px] text-zinc-300">{s.label}</p>
                <p className="truncate text-[9px] text-zinc-600">{s.description}</p>
              </div>
              {/* center baseline: losses extend left (red), gains right (green) */}
              <div className="flex flex-1 items-center">
                <div className="flex h-2.5 w-1/2 justify-end overflow-hidden rounded-sm bg-white/[0.02]">
                  {loss && (
                    <div
                      className={cn("h-full rounded-sm", flagged ? "bg-rose-500/80" : "bg-rose-400/55")}
                      style={{ width: `${(Math.abs(s.pnlPct) / maxMag) * 100}%` }}
                    />
                  )}
                </div>
                <div className="h-3 w-px shrink-0 bg-white/10" />
                <div className="flex h-2.5 w-1/2 overflow-hidden rounded-sm bg-white/[0.02]">
                  {!loss && (
                    <div
                      className="h-full rounded-sm bg-emerald-400/55"
                      style={{ width: `${(Math.abs(s.pnlPct) / maxMag) * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "w-[52px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums",
                  flagged ? "text-rose-400" : loss ? "text-rose-300/80" : "text-emerald-400",
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
        <p className="mt-2 text-[10.5px] text-rose-300/90">
          {worst.label} breaches the −10% NAV covenant line ({worst.pnlPct.toFixed(1)}%).
        </p>
      )}
    </article>
  );
}

// ── Limits table ──────────────────────────────────────────────────────────

function LimitRow({ row }: { row: EvaluatedRow }) {
  return (
    <tr className="border-b border-white/[0.04] last:border-b-0">
      <td className="py-1.5 pr-2">
        <span className="text-[12px] text-zinc-200">{row.limit.label}</span>
        {row.limit.note && (
          <span
            className="ml-1 cursor-help text-[10px] text-zinc-600"
            title={row.limit.note}
          >
            ⓘ
          </span>
        )}
      </td>
      <td className={cn("py-1.5 pr-2 text-right tabular-nums text-[12.5px] font-semibold", STATUS_TEXT[row.status])}>
        {row.display}
      </td>
      <td className="hidden py-1.5 pr-2 text-[11px] text-zinc-500 sm:table-cell">{row.limit.target}</td>
      <td className="hidden py-1.5 pr-2 text-[10.5px] text-zinc-600 md:table-cell">
        {CADENCE_LABEL[row.limit.cadence]}
      </td>
      <td className="hidden py-1.5 pr-2 lg:table-cell">
        <SourceTag source={row.limit.dataSource} />
      </td>
      <td className="py-1.5 text-right">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[row.status])} />
          <span className={cn("hidden text-[10.5px] font-medium sm:inline", STATUS_TEXT[row.status])}>
            {STATUS_LABEL[row.status]}
          </span>
        </span>
      </td>
    </tr>
  );
}

function SourceTag({ source }: { source: RiskDataSource }) {
  const tone =
    source === "live"
      ? "text-emerald-400/80 border-emerald-400/20"
      : source === "sample"
        ? "text-sky-300/80 border-sky-300/20"
        : source === "manual"
          ? "text-zinc-400 border-white/10"
          : "text-amber-300/70 border-amber-300/20";
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide", tone)}>
      {SOURCE_LABEL[source]}
    </span>
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
        <h3 className="text-[13px] font-semibold text-white">{label}</h3>
        <p className="text-[10.5px] text-zinc-500">{blurb}</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-white/10 text-left">
            <th className="py-1 pr-2 text-[9px] font-medium uppercase tracking-wider text-zinc-600">Metric</th>
            <th className="py-1 pr-2 text-right text-[9px] font-medium uppercase tracking-wider text-zinc-600">Current</th>
            <th className="hidden py-1 pr-2 text-[9px] font-medium uppercase tracking-wider text-zinc-600 sm:table-cell">Target</th>
            <th className="hidden py-1 pr-2 text-[9px] font-medium uppercase tracking-wider text-zinc-600 md:table-cell">Cadence</th>
            <th className="hidden py-1 pr-2 text-[9px] font-medium uppercase tracking-wider text-zinc-600 lg:table-cell">Source</th>
            <th className="py-1 text-right text-[9px] font-medium uppercase tracking-wider text-zinc-600">Status</th>
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
    <div className="rounded-[10px] border border-rose-500/25 bg-rose-500/[0.06] px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        <p className="text-[12px] font-semibold text-rose-200">
          {breaches.length} limit{breaches.length > 1 ? "s" : ""} breached — flag in writing within 24h; rebalance drift breaches within 2 trading days.
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-3.5">
        {breaches.map((b) => (
          <span key={b.limit.id} className="text-[11px] text-rose-200/80">
            {b.limit.label}: <span className="font-semibold tabular-nums">{b.display}</span>
            <span className="text-rose-200/50"> (target {b.limit.target})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────

export function RiskMonitor({ model }: { model: RiskModel }) {
  const asOfLabel = (() => {
    try {
      return new Date(model.asOf).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return model.asOf;
    }
  })();

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header / legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              model.source === "live"
                ? "border-emerald-400/30 text-emerald-300"
                : "border-sky-300/30 text-sky-300",
            )}
          >
            {model.source === "live" ? "Live data" : "Sample book"}
          </span>
          {model.nav != null && (
            <span className="text-[11px] text-zinc-500">
              NAV <span className="tabular-nums text-zinc-300">{fmtCompact(model.nav)}</span>
            </span>
          )}
          <span className="text-[11px] text-zinc-600">as of {asOfLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular-nums">
          <LegendCount dot="bg-emerald-400" n={model.counts.green} label="in policy" />
          <LegendCount dot="bg-amber-300" n={model.counts.yellow} label="watch" />
          <LegendCount dot="bg-rose-400" n={model.counts.red} label="breach" />
          <LegendCount dot="bg-zinc-600" n={model.counts.na} label="pending" />
        </div>
      </div>

      {model.source === "sample" && (
        <p className="rounded-[10px] border border-sky-300/15 bg-sky-300/[0.04] px-3 py-1.5 text-[11px] text-sky-200/80">
          Illustrative long/short book for demo purposes — the in-app Risk Monitor always shows the real account.
        </p>
      )}

      {model.source === "live" && !model.hasLiveData && (
        <p className="rounded-[10px] border border-amber-400/20 bg-amber-400/[0.05] px-3 py-1.5 text-[11px] text-amber-200/85">
          Schwab data is temporarily unavailable (token refresh or API issue). Values will repopulate automatically —
          check the Admin panel if this persists.
        </p>
      )}

      <BreachBanner breaches={model.breaches} />

      {/* Neutrality headline */}
      <div className="grid gap-2 sm:grid-cols-3">
        <HeadlineTile row={model.headline.net} caption="Longs − shorts · drifts daily" />
        <HeadlineTile row={model.headline.gross} caption="Longs + shorts · 75 / 75 target" />
        <HeadlineTile row={model.headline.beta} caption="Weekly regression vs S&P 500" />
      </div>

      {/* Books + sector balance */}
      <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1.6fr]">
        <BookCard book={model.longBook} title="Long Book" />
        <BookCard book={model.shortBook} title="Short Book" />
        <SectorBalance rows={model.sectorBalance.slice(0, 8)} />
      </div>

      {/* Risk analytics: VaR / CVaR + stress tests */}
      {(model.varView || model.stress.length > 0) && (
        <div className="grid gap-2 lg:grid-cols-2">
          <VarPanel v={model.varView} />
          <StressPanel scenarios={model.stress} worst={model.worstStress} />
        </div>
      )}

      {/* Full limits table */}
      <div className="grid gap-2 xl:grid-cols-2">
        {model.groups.map((g) => (
          <LimitGroup key={g.group} label={g.label} blurb={g.blurb} rows={g.rows} />
        ))}
      </div>
    </div>
  );
}

function LegendCount({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-400">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      <span className="font-semibold text-white">{n}</span>
      <span className="hidden text-zinc-500 md:inline">{label}</span>
    </span>
  );
}
