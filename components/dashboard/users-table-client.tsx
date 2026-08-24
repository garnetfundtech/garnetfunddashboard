"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import { AvatarInitials } from "@/components/dashboard/avatar-initials";
import { StatusPill, type Tone } from "@/components/dashboard/status-pill";
import { downloadCsv } from "@/lib/csv-client";
import type { FundUser, UserRole } from "@/lib/types";

type RoleFilter = "All" | "Analyst" | "Lead" | "Admin" | "Faculty";

const ROLE_TONE: Record<UserRole, Tone> = {
  analyst: "blue",
  pm: "accent",
  admin: "amber",
  developer: "neutral",
};

const ROLE_LABEL: Record<UserRole, string> = {
  analyst: "Analyst",
  pm: "Lead",
  admin: "Admin",
  developer: "Dev",
};

function rolePill(role: UserRole) {
  return <StatusPill label={ROLE_LABEL[role] ?? role} tone={ROLE_TONE[role] ?? "neutral"} dot={false} />;
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

export function UsersTableClient({
  users,
  viewerRole,
  highlightId,
}: {
  users: FundUser[];
  viewerRole: UserRole;
  highlightId?: string | null;
}) {
  const canInvite = viewerRole === "admin" || viewerRole === "developer";
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All");
  const [highlighted, setHighlighted] = useState<string | null>(highlightId ?? null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!highlightId) return;
    setHighlighted(highlightId);
    rowRefs.current[highlightId]?.scrollIntoView({ block: "center", behavior: "smooth" });
    const id = setTimeout(() => setHighlighted(null), 1400);
    return () => clearTimeout(id);
  }, [highlightId]);

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
          <span className="absolute inline-flex h-full w-full animate-ping rounded-none bg-pos opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-none bg-pos" />
        </span>
      ) : undefined,
    },
    { label: "Reports YTD", value: "XX", sub: "Across all members" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Fund Members"
        meta={`${users.length} member${users.length === 1 ? "" : "s"}`}
        actions={
          <>
            <GhostBtn
              onClick={() =>
                downloadCsv(
                  ["Name", "Role", "Online", "Last Seen"],
                  filtered.map((u) => [u.fullName, ROLE_LABEL[u.role] ?? u.role, u.isOnline ? "Yes" : "No", u.lastSeenAt ?? ""]),
                  "garnet-fund-roster.csv",
                )
              }
            >
              <Download className="h-3.5 w-3.5" />
              Roster
            </GhostBtn>
            {canInvite && (
              <PrimaryBtn>
                <Plus className="h-3.5 w-3.5" />
                Invite
              </PrimaryBtn>
            )}
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
            <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 text-right font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-[13.5px] text-ink-3">
                  No members match this filter.
                </td>
              </tr>
            )}
            {filtered.map((user) => {
              const lastActive = fmtLastActive(user.lastSeenAt, user.isOnline);

              return (
                <tr
                  key={user.id}
                  ref={(el) => {
                    rowRefs.current[user.id] = el;
                  }}
                  className={`border-b border-line last:border-b-0 transition-colors duration-[1200ms] hover:bg-paper-3 ${
                    highlighted === user.id ? "bg-garnet-soft" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <AvatarInitials fullName={user.fullName} size={28} />
                        {user.isOnline && (
                          <span className="absolute -bottom-px -right-px h-2 w-2 rounded-none border-[1.5px] border-surface bg-pos" />
                        )}
                      </div>
                      <span className="text-[14px] font-medium text-ink">{user.fullName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{rolePill(user.role)}</td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">—</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[14px]">
                    {user.isOnline ? (
                      <span className="inline-flex items-center gap-1 text-pos">
                        <span className="h-1.5 w-1.5 rounded-none bg-pos" /> now
                      </span>
                    ) : (
                      <span className="text-ink-2">{lastActive}</span>
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
