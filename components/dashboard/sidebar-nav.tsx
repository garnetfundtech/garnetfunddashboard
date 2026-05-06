"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChartLine, FolderKanban, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/dashboard/logo-mark";
import type { UserRole } from "@/lib/types";

const items = [
  { href: "/home", label: "Home", icon: ChartLine },
  { href: "/research", label: "Research", icon: BookOpen },
  { href: "/resources", label: "Resources", icon: FolderKanban },
  { href: "/admin", label: "Admin", icon: Shield },
];

export function SidebarNav({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <aside className="panel flex h-full w-[240px] flex-col gap-5 p-4">
      <LogoMark />
      <nav className="flex flex-col gap-1">
        {items
          .filter((item) => (item.href === "/admin" ? role !== "analyst" : true))
          .map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800/60 hover:text-white",
                active && "bg-zinc-800 text-white",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
          })}
      </nav>
      <div className="mt-auto panel bg-[#140b0b] p-3">
        <p className="caps-label">Environment</p>
        <p className="text-sm font-medium text-white">Mock Data Mode</p>
        <p className="mt-1 text-xs text-zinc-400">Schwab sync endpoints ready to wire.</p>
      </div>
    </aside>
  );
}
