"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { RiskAlertsTab } from "@/components/dashboard/risk-alerts-tab";
import { RiskReportingTab } from "@/components/dashboard/risk-reporting-tab";
import { ApprovalForm, type AnalystOption } from "@/components/dashboard/risk-approval-form";
import { AsOf } from "@/components/dashboard/risk-status";
import type { PositionRow, RiskModel } from "@/lib/risk-engine";
import type { AlertLogRow } from "@/lib/risk-episodes";
import type { PackDef, PeriodKey, ReportingModel } from "@/lib/risk-reporting";
import type { CatalystFeed } from "@/lib/risk-catalysts";

export type RiskTab = "alerts" | "reporting";

const TABS: { value: RiskTab; label: string }[] = [
  { value: "alerts", label: "Alerts & Position Monitoring" },
  { value: "reporting", label: "Fund Reporting" },
];

/**
 * The two-tab risk dashboard (§4 and §5).
 *
 * The period lives in the URL because changing it genuinely needs the server:
 * a different window means a different slice of stored snapshots, and the
 * reporting model is rebuilt around it.
 *
 * The tab does not. Both tabs' data arrives in the same payload, so routing a
 * tab change through the server re-ran every upstream call — Schwab positions
 * and orders, the alert log, the NAV series, the T-bill, the analyst list, the
 * catalyst calendar and the whole reporting model — to render markup the
 * browser already had. That was the lag on every switch, and worst on the
 * first one, when none of those responses were cached yet. The tab is now
 * local state, and the URL is kept in step with history.replaceState so a
 * pasted link still opens the right view without costing a round trip.
 */
export function RiskDashboard({
  model,
  alertLog,
  catalysts,
  report,
  tab,
  fullBoard,
  period,
  packs,
  analysts,
  sectors,
  canEdit,
}: {
  model: RiskModel;
  alertLog: AlertLogRow[];
  catalysts: CatalystFeed;
  /** null for an analyst, who cannot open the Fund Reporting tab. */
  report: ReportingModel | null;
  tab: RiskTab;
  fullBoard: boolean;
  period: PeriodKey;
  packs: PackDef[];
  analysts: AnalystOption[];
  sectors: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<{ row: PositionRow | null } | null>(null);
  const [activeTab, setActiveTab] = useState<RiskTab>(tab);

  // A server-rendered tab change (someone arriving on a link) still wins.
  useEffect(() => setActiveTab(tab), [tab]);

  const selectTab = (next: RiskTab) => {
    setActiveTab(next);
    // Deep-linkable without a navigation: replaceState updates the address
    // bar and the history entry, and nothing re-renders on the server.
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    window.history.replaceState(null, "", `${pathname}?${params}`);
  };

  const selectPeriod = (next: PeriodKey) => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("period", next);
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  };

  const staleFeeds = model.feeds.filter((f) => !f.ok);
  const breaches = model.breaches.length;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Risk"
        meta={
          <span className="flex items-center gap-2">
            <span className={cn("text-[12.5px]", breaches ? "text-neg" : "text-pos")}>
              {breaches
                ? `${breaches} breach${breaches === 1 ? "" : "es"}`
                : fullBoard
                  ? "All limits within policy"
                  : "Your positions are within policy"}
            </span>
            <span className="text-ink-3">·</span>
            <AsOf iso={model.asOf} />
          </span>
        }
      />

      {fullBoard && (
        <nav className="flex items-end gap-0 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => selectTab(t.value)}
              className={cn(
                "-mb-px border-b-2 px-3.5 py-2 text-[13.5px] transition-colors",
                activeTab === t.value
                  ? "border-garnet font-medium text-ink"
                  : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {/* §1 rule 2: a feed that is down is said out loud, not left to a grey card. */}
      {staleFeeds.length > 0 && (
        <div className="panel flex flex-col gap-1 border-l-2 border-l-warn px-3 py-2">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-warn">
            <AlertTriangle className="h-3.5 w-3.5" />
            {staleFeeds.length} data feed{staleFeeds.length === 1 ? " is" : "s are"} unavailable or stale
          </p>
          {staleFeeds.map((feed) => (
            <p key={feed.label} className="text-[12px] text-ink-3">
              <span className="text-ink-2">{feed.label}</span> — {feed.note ?? "unavailable"}
            </p>
          ))}
        </div>
      )}

      {!model.hasLiveData && (
        <div className="panel px-3 py-6 text-center text-[13px] text-ink-3">
          No live broker data. Every card below is blank rather than showing a stale figure.
        </div>
      )}

      {!fullBoard && (
        <div className="panel px-3 py-2 text-[12.5px] text-ink-3">
          You are seeing the positions you are the assigned analyst on. The portfolio limit strip, the alert log
          and the Fund Reporting tab go to the Risk Manager, the President and the PMs [IPS IV.c step 6; Spec §6].
        </div>
      )}

      {activeTab === "alerts" ? (
        <RiskAlertsTab
          model={model}
          alertLog={alertLog}
          catalysts={catalysts}
          canEdit={canEdit}
          fullBoard={fullBoard}
          onEditApproval={(row) => setEditing({ row })}
        />
      ) : report ? (
        <div className={cn("transition-opacity", isPending && "pointer-events-none opacity-60")}>
          <RiskReportingTab
            report={report}
            period={period}
            periodPending={isPending}
            onPeriodChange={selectPeriod}
            packs={packs}
          />
        </div>
      ) : null}

      {/* Data provenance — §1 rule 2: every number carries a visible source. */}
      <section className="panel flex flex-col gap-1 px-3 py-2">
        <p className="caps text-[11px] text-ink-3">Data sources</p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {model.feeds.map((feed) => (
            <div key={feed.label} className="flex items-baseline justify-between gap-2 py-[2px]">
              <span className="text-[12px] text-ink-2">
                <span className={cn("mr-1.5 inline-block h-1.5 w-1.5", feed.ok ? "bg-pos" : "bg-warn")} />
                {feed.label}
              </span>
              <span className="text-[11px] text-ink-3">{feed.note ?? <AsOf iso={feed.asOf} prefix="" />}</span>
            </div>
          ))}
        </div>
      </section>

      {editing && canEdit && (
        <ApprovalForm
          row={editing.row}
          analysts={analysts}
          sectors={sectors}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
