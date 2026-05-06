import type { ApiHealth } from "@/lib/external-api-status";
import { cn } from "@/lib/utils";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-1.5 w-1.5 rounded-full",
        ok ? "bg-emerald-400" : "bg-red-400",
      )}
    />
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
      )}
    >
      <StatusDot ok={ok} />
      {label}
    </span>
  );
}

export function ExternalApiStatusPanel({ rows }: { rows: ApiHealth[] }) {
  return (
    <section className="panel p-5 space-y-4">
      <div>
        <p className="caps-label">External integrations</p>
        <h2 className="text-sm font-semibold text-white">API status</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Status checks are lightweight pings; “endpoints used” reflect what this dashboard calls for displayed data.
        </p>
      </div>

      <div className="rounded-[10px] bg-white/[0.03] divide-y divide-white/[0.05]">
        {rows.map((r) => (
          <div key={r.key} className="px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{r.label}</p>
                <p className="text-[11px] text-zinc-500 truncate">{r.detail}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">
                  {r.usedEndpoints.length} used / {r.totalOffered} offered
                </span>
                <StatusBadge ok={r.ok} label={r.ok ? "Connected" : "Disconnected"} />
              </div>
            </div>

            <details className="group">
              <summary className="cursor-pointer select-none text-[11px] text-zinc-400 hover:text-white">
                Endpoints in use
              </summary>
              <ul className="mt-2 space-y-1 text-[11px] text-zinc-400">
                {r.usedEndpoints.map((e) => (
                  <li key={e} className="font-mono text-zinc-500">
                    {e}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}

