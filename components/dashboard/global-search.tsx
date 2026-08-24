"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, BookOpen, FolderKanban, Bookmark } from "lucide-react";
import { AvatarInitials } from "@/components/dashboard/avatar-initials";
import { useClickOutside } from "@/lib/use-click-outside";
import type { SearchItem, SearchItemType } from "@/lib/search";

const TYPE_ICON: Record<Exclude<SearchItemType, "user">, typeof BookOpen> = {
  research: BookOpen,
  resource: FolderKanban,
  watchlist: Bookmark,
};

const MAX_RESULTS = 8;

export function GlobalSearch({ index }: { index: SearchItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, open, () => setOpen(false));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .filter((item) => item.searchable.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, index]);

  function go(item: SearchItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) go(item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full shrink-0">
      <div className="glass-input flex h-9 items-center gap-2 rounded-none px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-3" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
          placeholder="Search by ticker, title, or user"
        />
      </div>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 border border-line-2 bg-surface shadow-[0_4px_16px_rgba(23,24,26,0.12)]">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-[13.5px] text-ink-3">No matches for &quot;{query}&quot;.</p>
          ) : (
            results.map((item, i) => {
              const Icon = item.type === "user" ? null : TYPE_ICON[item.type];
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  onClick={() => go(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    i === activeIndex ? "bg-paper-2" : "hover:bg-paper-3"
                  }`}
                >
                  {item.type === "user" ? (
                    <AvatarInitials fullName={item.label} size={24} />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-line bg-paper-2 text-ink-2">
                      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{item.label}</span>
                    <span className="block truncate text-[12px] text-ink-3">{item.subtitle}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
