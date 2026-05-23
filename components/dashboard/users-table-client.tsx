"use client";

import { useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import type { FundUser, UserRole } from "@/lib/types";

type RoleFilter = "All" | "Analyst" | "Lead" | "Admin" | "Faculty";

function rolePill(role: UserRole) {
  const toneClasses: Record<string, string> = {
    analyst: "border-blue-400/25 bg-blue-400/10 text-blue-400",
    pm: "border-[var(--gf-accent)]/30 bg-[var(--gf-accent)]/10 text-[var(--gf-accent-fg)]",
    admin: "border-amber-400/25 bg-amber-400/10 text-amber-400",
    developer: "border-white/[0.08] bg-white/[0.04] text-zinc-400",
  };
  const labels: Record<UserRole, string> = {
    analyst: "Analyst",
    pm: "Lead",
    admin: "Admin",
    developer: "Dev",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-[1px] text-[10px] font-medium ${toneClasses[role] ?? "border-white/[0.08] bg-white/[0.04] text-zinc-400"}`}>
      {labels[role] ?? role}
    </span>
  );
}

function fmtLastActive(iso: string | null, isOnline: boolean): string {
  if (isOnline) return "now";
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function UsersTableClient({ users }: { users: FundUser[] }) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All");

  const onlineCount = users.filter((u) => u.isOnline).length;
  const analystCount = users.filter((u) => u.role === "analyst").length;
  const leadCount = users.filter((u) => u.role === "pm").length;

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter === "All") return true;
      if (roleFilter === "Analyst") return u.role === "analyst";
      if (roleFilter === "Lead") return u.role === "pm";
      if (roleFilter === "Admin") return u.role === "admin";
      if (roleFilter === "Faculty") return false;
      return true;
    });
  }, [users, roleFilter]);

  const kpiTiles = [
    { label: "Total members", value: String(users.length), sub: "Spring 2026 term" },
    { label: "Active analysts", value: String(analystCount), sub: "Across covered sectors" },
    { label: "Leads", value: String(leadCount), sub: "Sector heads" },
    {
      label: "Online now",
      value: String(onlineCount),
      sub: `${users.length > 0 ? Math.round((onlineCount / users.length) * 100) : 0}% of team`,
      tone: onlineCount > 0 ? ("pos" as const) : null,
      badge: onlineCount > 0 ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      ) : undefined,
    },
    { label: "Reports YTD", value: "—", sub: "Across all members" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Members"
        title="Fund Members"
        subtitle="Active analysts, leads, and faculty oversight."
        actions={
          <>
            <GhostBtn>
              <Download className="h-3.5 w-3.5" />
              Roster
            </GhostBtn>
            <PrimaryBtn>
              <Plus className="h-3.5 w-3.5" />
              Invite
            </PrimaryBtn>
          </>
        }
      />

      <KpiRow tiles={kpiTiles} />

      <TableShell
        kicker="Directory"
        title="Members"
        count={filtered.length}
        actions={
          <FilterTabs
            options={["All", "Analyst", "Lead", "Admin", "Faculty"] as RoleFilter[]}
            value={roleFilter}
            onChange={setRoleFilter}
          />
        }
      >
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 text-right font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-[11.5px] text-zinc-500">
                  No members match this filter.
                </td>
              </tr>
            )}
            {filtered.map((user) => {
              const initials = user.fullName
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("");
              const lastActive = fmtLastActive(user.lastSeenAt, user.isOnline);

              return (
                <tr
                  key={user.id}
                  className="border-b border-white/[0.025] last:border-b-0 transition hover:bg-white/[0.02]"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-semibold text-zinc-200">
                          {initials || "?"}
                        </div>
                        {user.isOnline && (
                          <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border-[1.5px] border-[var(--panel)] bg-emerald-400" />
                        )}
                      </div>
                      <span className="text-[12.5px] font-medium text-white">{user.fullName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{rolePill(user.role)}</td>
                  <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">—</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px]">
                    {user.isOnline ? (
                      <span className="text-emerald-400">● now</span>
                    ) : (
                      <span className="text-zinc-400">{lastActive}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
