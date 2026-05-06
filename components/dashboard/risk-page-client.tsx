"use client";

import { cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/lib/types";
import type { PortfolioRiskStats } from "@/lib/compute-portfolio-risk-stats";
import type { InsiderFiling } from "@/lib/edgar";

function flagClass(pct: number) {
  if (pct > 30) return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
  if (pct > 20) return "bg-amber-500/15 text-amber-200 border border-amber-500/25";
  return "bg-emerald-500/10 text-emerald-300/90 border border-emerald-500/20";
}

export function RiskPageClient({
  portfolio,
  stats,
  matrix,
  insiderByTicker,
  hasOptions,
}: {
  portfolio: PortfolioSummary | null;
  stats: PortfolioRiskStats | null;
  matrix: { labels: string[]; matrix: (number | null)[][] };
  insiderByTicker: { ticker: string; filings: InsiderFiling[] }[];
  hasOptions: boolean;
}) {
  const positions = portfolio?.positions ?? [];
  const sectors = stats?.sectors ?? [];

  const significantInsider =
    insiderByTicker.some((x) => x.filings.length >= 4) ||
    insiderByTicker.some((x) => x.filings.filter((f) => new Date(f.filedAt) > new Date(Date.now() - 14 * 86400000)).length >= 2);

  return (
    <div className="space-y-3">
      {significantInsider && positions.length ? (
        <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Elevated Form 4 filing velocity detected on one or more holdings — review insider activity on position
          views and below.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="panel p-4">
          <p className="caps-label">Market risk</p>
          <h2 className="text-sm font-semibold text-white">Portfolio beta (vs SPY)</h2>
          <p className="mt-4 text-4xl font-semibold tabular-nums text-white">
            {stats?.betaVsSpy != null ? stats.betaVsSpy.toFixed(2) : "—"}
          </p>
          <p className="mt-2 text-xs text-zinc-500">Higher beta = more equity sensitivity vs the S&amp;P 500 ETF.</p>
        </section>

        <section className="panel p-4">
          <p className="caps-label">Concentration</p>
          <h2 className="text-sm font-semibold text-white">Sector limits</h2>
          <p className="mt-1 text-[11px] text-zinc-500">Flag when any sector exceeds 30% of the equity book.</p>
          <ul className="mt-3 space-y-2">
            {sectors.length ? (
              sectors.map((s) => (
                <li
                  key={s.name}
                  className={cn("flex items-center justify-between rounded-[8px] px-2.5 py-2 text-xs", flagClass(s.weight))}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="tabular-nums">{s.weight.toFixed(1)}%</span>
                </li>
              ))
            ) : (
              <li className="text-xs text-zinc-500">No sector breakdown yet.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="panel overflow-hidden p-4">
        <p className="caps-label">Correlation</p>
        <h2 className="text-sm font-semibold text-white">Holdings (daily returns)</h2>
        {matrix.labels.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[280px] border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="p-1 text-left text-zinc-500" />
                  {matrix.labels.map((l) => (
                    <th key={l} className="p-1 text-center font-medium text-zinc-400">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.labels.map((row, i) => (
                  <tr key={row}>
                    <td className="p-1 font-medium text-zinc-400">{row}</td>
                    {matrix.labels.map((_, j) => {
                      const v = matrix.matrix[i]?.[j];
                      const heat =
                        v == null
                          ? "bg-zinc-900/40 text-zinc-600"
                          : v >= 0.85
                            ? "bg-rose-500/25 text-rose-100"
                            : v >= 0.65
                              ? "bg-amber-500/15 text-amber-100"
                              : "bg-emerald-500/10 text-emerald-100";
                      return (
                        <td key={`${i}-${j}`} className={cn("p-1 text-center tabular-nums", heat)}>
                          {v == null ? "—" : v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Need at least two symbols for a matrix.</p>
        )}
      </section>

      <section className="panel relative overflow-hidden p-4">
        {!hasOptions ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-[2px]">
            <span className="rounded-full border border-white/10 bg-zinc-900/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
              Pending options access
            </span>
            <p className="max-w-md px-4 text-center text-[11px] text-zinc-400">
              Net delta and delta-adjusted exposure by sector will populate when listed options appear in Schwab
              position data.
            </p>
          </div>
        ) : null}
        <p className={cn("caps-label", !hasOptions && "opacity-40")}>Derivatives</p>
        <h2 className={cn("text-sm font-semibold text-white", !hasOptions && "opacity-40")}>Delta exposure</h2>
        <table className={cn("mt-3 w-full text-xs", !hasOptions && "opacity-30")}>
          <thead>
            <tr className="text-zinc-500">
              <th className="py-1 text-left">Sector</th>
              <th className="py-1 text-right">Net delta</th>
              <th className="py-1 text-right">Delta-adj. $</th>
            </tr>
          </thead>
          <tbody>
            {(sectors.length ? sectors : [{ name: "—", weight: 0 }]).map((s) => (
              <tr key={s.name} className="border-t border-white/[0.04]">
                <td className="py-2">{s.name}</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right">—</td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasOptions ? (
          <p className="mt-2 text-[11px] text-amber-200/80">
            Options positions detected — delta/Greeks parsing from Schwab is not wired yet; use Trader for
            execution risk.
          </p>
        ) : null}
      </section>

      <section className="panel p-4">
        <p className="caps-label">Insider</p>
        <h2 className="text-sm font-semibold text-white">Recent Form 4 (SEC)</h2>
        <ul className="mt-2 space-y-2 text-xs">
          {insiderByTicker.length ? (
            insiderByTicker.map(({ ticker, filings }) => (
              <li key={ticker} className="rounded-[8px] bg-white/[0.03] px-2.5 py-2">
                <span className="font-semibold text-white">{ticker}</span>{" "}
                <span className="text-zinc-500">
                  {filings.length ? `${filings.length} recent filing(s)` : "No recent Form 4"}
                </span>
                {filings[0] ? (
                  <a
                    href={filings[0].url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-[#f4c5c4] underline hover:text-white"
                  >
                    Latest
                  </a>
                ) : null}
              </li>
            ))
          ) : (
            <li className="text-zinc-500">No equity positions to scan.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
