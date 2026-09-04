"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RiskStatus } from "@/lib/risk-parameters";

/**
 * The one colour convention for the whole risk dashboard, per §4:
 * green = within limit, yellow = approaching limit, red = breached,
 * grey = data stale or missing.
 */
export const STATUS_TEXT: Record<RiskStatus, string> = {
  green: "text-pos",
  yellow: "text-warn",
  red: "text-neg",
  na: "text-ink-3",
};

export const STATUS_BG: Record<RiskStatus, string> = {
  green: "bg-pos",
  yellow: "bg-warn",
  red: "bg-neg",
  na: "bg-ink-3",
};

export const STATUS_VAR: Record<RiskStatus, string> = {
  green: "var(--pos)",
  yellow: "var(--warn)",
  red: "var(--neg)",
  na: "var(--line-2)",
};

export const STATUS_LABEL: Record<RiskStatus, string> = {
  green: "Within limit",
  yellow: "Approaching",
  red: "Breached",
  na: "No data",
};

export function StatusDot({ status, label }: { status: RiskStatus; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-none", STATUS_BG[status])} />
      <span className={cn("text-[11px] font-medium", STATUS_TEXT[status])}>
        {label ?? STATUS_LABEL[status]}
      </span>
    </span>
  );
}

/** A grey STALE marker, never a colour — §1 rule 2. */
export function StaleTag() {
  return (
    <span className="inline-flex items-center border border-line bg-paper-2 px-1.5 py-[1px] text-[10.5px] font-medium uppercase tracking-wider text-ink-3">
      Stale
    </span>
  );
}

export function AsOf({ iso, prefix = "As of" }: { iso: string | null; prefix?: string }) {
  if (!iso) return <span className="text-[11px] text-ink-3">{prefix} —</span>;
  const d = new Date(iso);
  const text = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <span className="text-[11px] text-ink-3">
      {prefix} {text}
    </span>
  );
}

export function Cell({
  status,
  children,
  className,
}: {
  status: RiskStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-2.5 py-1.5 num text-[13px] whitespace-nowrap", STATUS_TEXT[status], className)}>
      {children}
    </td>
  );
}

export function fmtUsd(v: number | null | undefined, compact = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (compact && abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (compact && abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
}
