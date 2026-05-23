"use client";

import { useState, useEffect } from "react";
import { Download, RefreshCw, Search } from "lucide-react";

function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function TopBar({
  searchValue,
  onSearchChange,
  placeholder = "Search by ticker, title, or user…",
  lastSync,
  rightExtras,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  lastSync?: string | null;
  rightExtras?: React.ReactNode;
}) {
  const [internalSearch, setInternalSearch] = useState("");
  const [syncLabel, setSyncLabel] = useState<string | null>(() => lastSync ? relativeTime(lastSync) : null);

  const value = searchValue ?? internalSearch;
  const setValue = onSearchChange ?? setInternalSearch;

  useEffect(() => {
    if (!lastSync) return;
    const id = setInterval(() => setSyncLabel(relativeTime(lastSync)), 30_000);
    return () => clearInterval(id);
  }, [lastSync]);

  return (
    <header className="flex items-center gap-2">
      <div className="glass-input flex h-[32px] flex-1 items-center gap-2 rounded-[8px] px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder={placeholder}
        />
        <kbd className="hidden rounded border border-white/10 bg-white/[0.04] px-1.5 py-px text-[10px] text-zinc-500 sm:inline">
          ⌘K
        </kbd>
      </div>

      {lastSync && (
        <div className="flex h-[32px] items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--panel)] px-2.5 text-[11.5px] text-zinc-400 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]" />
          <span className="hidden sm:inline">Schwab synced</span>
          <span className="text-zinc-600 hidden sm:inline">·</span>
          <span className="text-zinc-500 tabular-nums">{syncLabel}</span>
          <button
            type="button"
            className="ml-0.5 rounded p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <button
        type="button"
        className="flex h-[32px] items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--panel)] px-3 text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.04] shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Export</span>
      </button>

      {rightExtras && <div className="flex items-center gap-2">{rightExtras}</div>}
    </header>
  );
}
