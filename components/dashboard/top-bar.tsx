"use client";

import { useEffect, useRef } from "react";
import { Bell, Search, TrendingUp, Clock, X } from "lucide-react";
import { useState } from "react";
import { useMarketNotifications, type NotifKind } from "@/lib/hooks/use-market-notifications";

const KIND_ICON: Record<NotifKind, React.ReactNode> = {
  market_open:    <Clock className="h-3.5 w-3.5 text-emerald-400" />,
  market_close:   <Clock className="h-3.5 w-3.5 text-zinc-400" />,
  milestone_up:   <TrendingUp className="h-3.5 w-3.5 text-amber-400" />,
  milestone_down: <TrendingUp className="h-3.5 w-3.5 text-red-400 rotate-180" />,
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function TopBar() {
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);
  const { notifs, dismiss, clearAll } = useMarketNotifications();

  const unread = notifs.length;

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="glass-input flex h-[42px] w-full items-center gap-2 px-3">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder="Search by ticker, title, or user..."
        />
      </div>

      {/* Notification bell */}
      <div ref={ref} className="relative flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="glass-input relative flex h-[42px] w-[42px] items-center justify-center text-zinc-300 transition-colors hover:bg-white/10"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#8e0604] text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-[300px] rounded-[9px] bg-white/[0.03] border border-white/[0.06] shadow-2xl p-1">
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Notifications
              </p>
              {notifs.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" />
                  Clear all
                </button>
              )}
            </div>

            {/* Items */}
            <div className="max-h-[340px] overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="rounded-[8px] px-2 py-4 text-center">
                  <p className="text-xs text-zinc-600">No new notifications at this time</p>
                </div>
              ) : (
                notifs.map((n) => (
                  <div
                    key={n.id}
                    className="group flex items-start gap-2 rounded-[8px] px-2 py-2 hover:bg-zinc-800/70"
                  >
                    <div className="mt-0.5 shrink-0">{KIND_ICON[n.kind]}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white leading-snug">{n.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-400 leading-snug">{n.body}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-600">{relativeTime(n.ts)}</p>
                    </div>
                    <button
                      onClick={() => dismiss(n.id)}
                      className="mt-0.5 shrink-0 rounded-[4px] p-0.5 text-zinc-600 transition-colors hover:bg-zinc-700/60 hover:text-zinc-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
