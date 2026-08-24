"use client";

export function SchwabNextSyncLabel({
  lastFinishedAt,
  intervalMinutes,
}: {
  lastFinishedAt: string | null;
  intervalMinutes: number;
}) {
  if (!lastFinishedAt) {
    return <p className="text-xs text-ink-3">Next scheduled sync: unknown (no completed sync yet).</p>;
  }
  const next = new Date(new Date(lastFinishedAt).getTime() + intervalMinutes * 60000);
  return (
    <p className="text-xs text-ink-2">
      Next scheduled Schwab sync (approx):{" "}
      <span className="font-medium text-ink">{next.toLocaleString()}</span>
      <span className="text-ink-3"> · interval {intervalMinutes}m (SCHWAB_SYNC_INTERVAL_MINUTES)</span>
    </p>
  );
}
