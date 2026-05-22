"use client";

import { useTransition } from "react";
import type { UserRole } from "@/lib/types";
import { updateUserRoleAction } from "@/app/(dashboard)/admin/actions";

const ROLES: UserRole[] = ["analyst", "pm", "admin", "developer"];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RoleSelect({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: UserRole;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as UserRole;
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("role", next);
    startTransition(async () => {
      await updateUserRoleAction(fd);
    });
  }

  return (
    <select
      defaultValue={currentRole}
      onChange={handleChange}
      disabled={isPending}
      className="w-full rounded-[6px] border border-[#262a2f] bg-[#111214] px-2.5 py-1.5 text-center text-xs font-medium text-zinc-200 outline-none disabled:opacity-60"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {cap(r)}
        </option>
      ))}
    </select>
  );
}
