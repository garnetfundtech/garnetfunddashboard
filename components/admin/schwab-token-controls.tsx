"use client";

import { useEffect, useMemo, useState } from "react";

function fmtRemaining(ms: number) {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function SchwabTokenControls({
  accessExpiresAt,
  refreshExpiresAt,
}: {
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
}) {
  const target = refreshExpiresAt ?? accessExpiresAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!target) return null;
    return new Date(target).getTime() - now;
  }, [target, now]);

  async function reauth() {
    try {
      const res = await fetch("/api/schwab/auth-url?provider=trader");
      const json = (await res.json()) as { ok?: boolean; url?: string; message?: string };
      if (json.ok && json.url) {
        window.location.href = json.url;
      } else {
        alert(json.message ?? "Could not start Schwab OAuth.");
      }
    } catch {
      alert("Network error starting OAuth.");
    }
  }

  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-400">Schwab token expiry</p>
          <p className="mt-1 text-sm text-white">
            {target ? (
              <>
                {refreshExpiresAt ? "Refresh token" : "Access token"} ·{" "}
                <span className="tabular-nums text-[#f4c5c4]">
                  {remaining != null ? fmtRemaining(remaining) : "—"} remaining
                </span>
              </>
            ) : (
              "No expiry timestamp on file"
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {refreshExpiresAt
              ? "Schwab refresh tokens can be long-lived; re-auth before rotation."
              : "Access tokens refresh automatically while the refresh token is valid."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reauth()}
            className="rounded-[10px] bg-[#8e0604] px-3 py-2 text-xs font-medium text-white hover:bg-[#a80705]"
          >
            Re-authenticate Schwab
          </button>
        </div>
      </div>
    </div>
  );
}
