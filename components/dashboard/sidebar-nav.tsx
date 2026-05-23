"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  BookOpen,
  CalendarDays,
  ChartLine,
  ClipboardList,
  FolderKanban,
  Layers,
  LogOut,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import { logoutAction } from "@/app/(auth)/login/actions";
import { getSidebarNavItems } from "@/lib/nav-access";

const ICONS = {
  "/home": ChartLine,
  "/coverage": Layers,
  "/users": Users,
  "/research": BookOpen,
  "/resources": FolderKanban,
  "/orders": ClipboardList,
  "/alerts": Bell,
  "/watchlist": Bookmark,
  "/earnings": CalendarDays,
} as const;

export function SidebarNav({
  role,
  fullName,
}: {
  role: UserRole;
  fullName: string;
}) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const initials = useMemo(
    () =>
      fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join(""),
    [fullName],
  );

  const items = getSidebarNavItems(role);

  return (
    <aside className="panel flex h-full w-[176px] flex-col bg-[#08090a] px-2.5 py-3">
      <div className="px-2 py-1">
        <span className="text-[13px] font-semibold tracking-tight text-white">Garnet Fund</span>
      </div>
      <nav className="mt-5 flex flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = ICONS[item.href as keyof typeof ICONS] ?? ChartLine;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] text-zinc-400 transition hover:bg-zinc-900/70 hover:text-white",
                active && "bg-white/[0.045] text-white",
              )}
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1.5 pt-2">
        {isMenuOpen ? (
          <div className="rounded-[9px] bg-white/[0.03] p-1">
            {role === "developer" || role === "admin" ? (
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800/70"
              >
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span>Admin</span>
              </Link>
            ) : (
              <Link
                href="/onboarding"
                className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800/70"
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                <span>Settings</span>
              </Link>
            )}
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-1 flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-xs text-zinc-300 hover:bg-[#8e060420] hover:text-[#f4c5c4]"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          className="glass-input flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 hover:bg-white/[0.06]"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-zinc-200">
            {initials || "U"}
          </div>
          <span className="truncate text-[12px] text-zinc-400">{fullName}</span>
        </button>
      </div>
    </aside>
  );
}
