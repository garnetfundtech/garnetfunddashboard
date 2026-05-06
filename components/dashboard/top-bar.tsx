"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Search, TrendingUp, Clock } from "lucide-react";

type NotifKind = "market_open" | "market_close" | "milestone";

type Notification = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  ts: string;
  read: boolean;
};

// Placeholder notifications — these will be replaced by real-time logic once
// a webhook or polling layer is wired up (e.g. Supabase Realtime or a cron
// that checks market hours and position return milestones).
const PLACEHOLDER_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    kind: "market_open",
    title: "Market Open",
    body: "Regular session started at 9:30 AM EST. NYSE & NASDAQ are open.",
    ts: new Date().toISOString(),
    read: false,
  },
  {
    id: "2",
    kind: "milestone",
    title: "Milestone — S&P 500 +5% YTD",
    body: "The S&P 500 (SPY) has crossed the +5% all-time return threshold for the year.",
    ts: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    read: false,
  },
];

const KIND_ICON: Record<NotifKind, React.ReactNode> = {
  market_open:  <Clock className="h-3.5 w-3.5 text-emerald-400" />,
  market_close: <Clock className="h-3.5 w-3.5 text-zinc-400" />,
  milestone:    <TrendingUp className="h-3.5 w-3.5 text-amber-400" />,
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function TopBar() {
  const [open, setOpen]       = useState(false);
  const [notifs, setNotifs]   = useState<Notification[]>(PLACEHOLDER_NOTIFICATIONS);
  const ref                   = useRef<HTMLDivElement>(null);

  const unread = notifs.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    function handler(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

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
          onClick={() => { setOpen((v) => !v); if (!open) markAllRead(); }}
          className="glass-input relative flex h-[42px] w-[42px] items-center justify-center text-zinc-300 transition-colors hover:bg-white/10"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#8e0604] text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {/* Dropdown panel — styled like the sidebar account popup */}
        {open && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-[340px] rounded-[12px] bg-[#08090a] border border-white/[0.06] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <p className="text-sm font-semibold text-white">Notifications</p>
              <button
                onClick={markAllRead}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Mark all read
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04]">
              {notifs.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-600">No notifications</p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] ${
                      n.read ? "opacity-50" : ""
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{KIND_ICON[n.kind]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-white leading-snug">{n.title}</p>
                        <span className="shrink-0 text-[10px] text-zinc-600">{relativeTime(n.ts)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-400 leading-snug">{n.body}</p>
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8e0604]" />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-white/[0.06] px-4 py-2.5">
              <p className="text-[11px] text-zinc-600">
                Future alerts: market open/close · position milestones (+5%, +10%, +25% all-time, daily &amp; weekly)
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
