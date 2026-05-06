import { Bell, Search } from "lucide-react";

export function TopBar() {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="glass-input flex w-full items-center gap-2 px-3 py-2.5">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder="Search ticker, research, or resource..."
        />
      </div>
      <div className="flex items-center gap-2">
        <button className="glass-input p-2.5 text-zinc-300">
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
