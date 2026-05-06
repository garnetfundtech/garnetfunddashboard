"use client";

export function SchwabNextSyncLabel({
  lastFinishedAt,
  intervalMinutes,
}: {
  lastFinishedAt: string | null;
  intervalMinutes: number;
}) {
  if (!lastFinishedAt) {
    return <p className="text-xs text-zinc-500">Next scheduled sync: unknown (no completed sync yet).</p>;
  }
  const next = new Date(new Date(lastFinishedAt).getTime() + intervalMinutes * 60000);
  return (
    <p className="text-xs text-zinc-400">
      Next scheduled Schwab sync (approx):{" "}
      <span className="font-medium text-white">{next.toLocaleString()}</span>
      <span className="text-zinc-600"> · interval {intervalMinutes}m (SCHWAB_SYNC_INTERVAL_MINUTES)</span>
    </p>
  );
}
