"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  BookOpen,
  CalendarDays,
  ChartLine,
  ClipboardList,
  ShieldAlert,
  FolderKanban,
  FolderTree,
  Gauge,
  Layers,
  LogOut,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/dashboard/logo-mark";
import { AvatarInitials } from "@/components/dashboard/avatar-initials";
import { SchwabStatus } from "@/components/dashboard/schwab-status";
import type { UserRole } from "@/lib/types";
import { logoutAction } from "@/app/(auth)/login/actions";
import { getSidebarNavItems } from "@/lib/nav-access";
import { useClickOutside } from "@/lib/use-click-outside";

const ICONS = {
  "/home": ChartLine,
  "/risk": Gauge,
  "/coverage": Layers,
  "/users": Users,
  "/research": BookOpen,
  "/resources": FolderKanban,
  "/files": FolderTree,
  "/orders": ClipboardList,
  "/alerts": Bell,
  "/watchlist": Bookmark,
  "/earnings": CalendarDays,
  "/risk-admin": ShieldAlert,
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
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, isMenuOpen, () => setIsMenuOpen(false));

  const items = getSidebarNavItems(role);

  return (
    <aside className="flex h-full w-[184px] flex-col border-r border-line bg-surface px-0 py-0">
      <div className="flex h-[49px] shrink-0 items-center gap-2.5 border-b border-line px-3">
        <LogoMark />
        <span className="display text-[15px] text-ink">Garnet Fund</span>
      </div>

      <nav className="mt-2 flex flex-col px-2">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = ICONS[item.href as keyof typeof ICONS] ?? ChartLine;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2.5 px-2.5 py-[7px] text-[14px] text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink",
                active && "bg-paper-2 text-ink",
              )}
            >
              {active && (
                <span className="absolute inset-y-0 left-0 w-[2px] bg-garnet" aria-hidden />
              )}
              <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div ref={menuRef} className="mt-auto px-2 pb-2">
        <div className="mb-1.5 px-0.5">
          <SchwabStatus />
        </div>
        {isMenuOpen ? (
          <div className="mb-1 border border-line">
            {role === "developer" || role === "admin" ? (
              <Link
                href="/admin"
                className="flex items-center gap-2 px-2.5 py-2 text-[13.5px] text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                <Shield className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>Admin</span>
              </Link>
            ) : (
              <Link
                href="/onboarding"
                className="flex items-center gap-2 px-2.5 py-2 text-[13.5px] text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>Settings</span>
              </Link>
            )}
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13.5px] text-ink-2 hover:bg-garnet hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          className="flex w-full items-center gap-2.5 border border-line px-2 py-2 text-left transition-colors hover:bg-paper-2"
        >
          <AvatarInitials fullName={fullName} size={26} />
          <span className="truncate text-[13.5px] text-ink-2">{fullName}</span>
        </button>
      </div>
    </aside>
  );
}
