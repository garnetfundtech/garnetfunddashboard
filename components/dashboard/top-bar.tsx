import { Bell, Search, UserCircle2 } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import type { UserRole } from "@/lib/types";

export function TopBar({ email, role }: { email: string; role: UserRole }) {
  return (
    <header className="panel flex items-center justify-between gap-3 p-3">
      <div className="flex w-full max-w-md items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder="Search ticker, research, or resource..."
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="caps-label hidden md:inline">{role}</span>
        <span className="hidden text-xs text-zinc-400 md:inline">{email}</span>
        <button className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] p-2 text-zinc-300">
          <Bell className="h-4 w-4" />
        </button>
        <button className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] p-2 text-zinc-300">
          <UserCircle2 className="h-4 w-4" />
        </button>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-xs text-zinc-300"
          >
            Sign Out
          </button>
        </form>
      </div>
    </header>
  );
}
