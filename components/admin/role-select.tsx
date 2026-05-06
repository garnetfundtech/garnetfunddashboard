"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import type { UserRole } from "@/lib/types";
import { updateUserRoleAction } from "@/app/(dashboard)/admin/actions";

const ROLES: UserRole[] = ["analyst", "pm", "admin", "developer"];

const ROLE_STYLES: Record<UserRole, string> = {
  analyst:   "text-sky-400",
  pm:        "text-rose-300",
  admin:     "text-amber-400",
  developer: "text-violet-400",
};

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
  const [open, setOpen]             = useState(false);
  const [role, setRole]             = useState<UserRole>(currentRole);
  const [isPending, startTransition] = useTransition();
  const ref                          = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleSelect(next: UserRole) {
    setOpen(false);
    if (next === role) return;
    setRole(next);
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("role", next);
    startTransition(async () => {
      await updateUserRoleAction(fd);
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      {/* Dropdown popover — same style as sidebar account popup */}
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 min-w-[140px] rounded-[9px] bg-[#08090a] border border-white/[0.06] p-1 shadow-2xl">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleSelect(r)}
              className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs transition-colors hover:bg-zinc-800/70 ${
                r === role ? "text-white font-medium" : "text-zinc-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${r === role ? "bg-white" : "bg-transparent"}`} />
              {cap(r)}
            </button>
          ))}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={`glass-input flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 disabled:opacity-60 ${ROLE_STYLES[role]}`}
      >
        {isPending ? (
          <span className="text-zinc-500">Saving…</span>
        ) : (
          <>
            {cap(role)}
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          </>
        )}
      </button>
    </div>
  );
}
