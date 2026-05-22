"use client";

import { useState } from "react";
import { Search } from "lucide-react";

export function TopBar({
  searchValue,
  onSearchChange,
  placeholder = "Search by ticker, title, or user...",
  rightExtras,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  rightExtras?: React.ReactNode;
}) {
  const [internalSearch, setInternalSearch] = useState("");

  const value = searchValue ?? internalSearch;
  const setValue = onSearchChange ?? setInternalSearch;

  return (
    <header className="flex items-center gap-3">
      <div className="glass-input flex h-[42px] flex-1 items-center gap-2 px-3">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder={placeholder}
        />
      </div>
      {rightExtras ? <div className="flex items-center gap-2">{rightExtras}</div> : null}
    </header>
  );
}
