import { Bell, Search } from "lucide-react";

export function TopBar() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-1 pb-3">
      <div className="flex w-full max-w-md items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[#101216] px-3 py-2">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder="Search ticker, research, or resource..."
        />
      </div>
      <div className="flex items-center gap-2">
        <button className="rounded-[10px] border border-[var(--border)] bg-[#101216] p-2 text-zinc-300">
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
