"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Highlight } from "@/components/dashboard/highlight";
import type { FundUser } from "@/lib/types";

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function fmtLastSeen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}

export function UsersTableClient({ users }: { users: FundUser[] }) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery =
        !q ||
        user.fullName.toLowerCase().includes(q) ||
        user.role.toLowerCase().includes(q) ||
        (user.isOnline ? "online" : "offline").includes(q);
      const matchesRole = !roleFilter || user.role === roleFilter;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "online" ? user.isOnline : !user.isOnline);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="glass-input flex h-[42px] flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search users by name, role, or status"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="glass-input h-[42px] bg-transparent px-3 text-sm text-zinc-300 outline-none"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          <option value="developer">Developer</option>
          <option value="admin">Admin</option>
          <option value="pm">PM</option>
          <option value="analyst">Analyst</option>
        </select>
        <select
          className="glass-input h-[42px] bg-transparent px-3 text-sm text-zinc-300 outline-none"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {/* Table */}
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Member</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No members match your search.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr key={user.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3 text-white">
                    <Highlight text={user.fullName} query={query} />
                  </td>
                  <td className="px-4 py-3 text-white">
                    <Highlight text={formatRole(user.role)} query={query} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          user.isOnline ? "bg-emerald-500" : "bg-[#8e0604]"
                        }`}
                      />
                      <span className="text-white">
                        {user.isOnline ? "Online" : "Offline"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white">
                    {user.lastSeenAt
                      ? fmtLastSeen(user.lastSeenAt)
                      : "Never"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
