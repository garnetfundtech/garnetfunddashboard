"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronUp,
  LogOut,
  Settings,
  UserCircle2,
  Users,
  BookOpen,
  ChartLine,
  FolderKanban,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/dashboard/logo-mark";
import type { UserRole } from "@/lib/types";
import { logoutAction } from "@/app/(auth)/login/actions";

const items = [
  { href: "/home", label: "Home", icon: ChartLine },
  { href: "/users", label: "Users", icon: Users },
  { href: "/research", label: "Research", icon: BookOpen },
  { href: "/resources", label: "Resources", icon: FolderKanban },
];

function toLabelCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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

  return (
    <aside className="panel flex h-full w-[248px] flex-col bg-[#08090a] px-3 py-4">
      <LogoMark />
      <div className="mt-6 px-1">
        <p className="caps-label">Navigation</p>
      </div>
      <nav className="mt-2 flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900/70 hover:text-white",
                active && "bg-zinc-900/80 text-white",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        {isMenuOpen ? (
          <div className="rounded-[10px] bg-white/[0.03] p-1">
            {role === "developer" || role === "admin" ? (
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-[8px] px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800/70"
              >
                <Shield className="h-3.5 w-3.5" />
                Account Admin
              </Link>
            ) : (
              <Link
                href="/onboarding"
                className="flex items-center gap-2 rounded-[8px] px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800/70"
              >
                <Settings className="h-3.5 w-3.5" />
                Account
              </Link>
            )}
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-1 flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-xs text-zinc-300 hover:bg-[#8e060420] hover:text-[#f4c5c4]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </form>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          className="glass-input flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-white/[0.1]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-zinc-200">
            {initials || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{fullName}</p>
            <p className="text-xs text-zinc-400">{toLabelCase(role)}</p>
          </div>
          <ChevronUp
            className={cn("h-4 w-4 text-zinc-500 transition-transform", isMenuOpen && "rotate-180")}
          />
          <UserCircle2 className="sr-only" />
        </button>
      </div>
    </aside>
  );
}
