"use client";

import { useEffect, useState } from "react";

type Status = { connected: boolean; syncedAt: string | null };

function fmtSyncedAt(iso: string | null): string {
  if (!iso) return "Never";
  // Time only — this updates continuously through the trading day, so the
  // date never adds information and only made the pill wrap onto two lines.
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * The single Schwab connection indicator for the whole app: a dot plus the
 * time data was last confirmed live. Replaces the assorted "Live"/"As
 * of"/"Live Positions" labels that used to say the same thing differently on
 * every page.
 */
export function SchwabStatus({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/schwab/status");
        const json = (await res.json()) as Status;
        if (!cancelled) setStatus(json);
      } catch {
        /* keep showing the last known status */
      }
    }
    void poll();
    const id = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const connected = status?.connected ?? false;

  return (
    <div className={`flex items-center justify-center gap-1.5 text-[13px] text-ink-2 ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-none ${connected ? "bg-pos" : "bg-neg"}`} />
      <span>Schwab</span>
      <span className="text-ink-3 tabular-nums">{status ? fmtSyncedAt(status.syncedAt) : "..."}</span>
    </div>
  );
}
