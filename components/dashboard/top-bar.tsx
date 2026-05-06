"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { AiChatTrigger } from "@/components/dashboard/ai-chat-panel";

export function TopBar({
  searchValue,
  onSearchChange,
  placeholder = "Search by ticker, title, or user...",
  leftExtras,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  leftExtras?: React.ReactNode;
}) {
  const [internalSearch, setInternalSearch] = useState("");

  const value = searchValue ?? internalSearch;
  const setValue = onSearchChange ?? setInternalSearch;

  return (
    <header className="flex items-center gap-3">
      <div className="flex w-full items-center gap-2">
        <div className="glass-input flex h-[42px] min-w-[240px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder={placeholder}
          />
        </div>
        {leftExtras ? <div className="flex items-center gap-2">{leftExtras}</div> : null}
      </div>
      <AiChatTrigger />
    </header>
  );
}
