"use client";

import { useTransition } from "react";
import { assignSectorAction } from "@/app/(dashboard)/admin/actions";

const SECTORS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Industrials",
  "Communication Services",
  "Energy",
  "Basic Materials",
  "Real Estate",
  "Utilities",
];

export function SectorSelect({
  userId,
  currentSector,
}: {
  userId: string;
  currentSector: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value || null;
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("sector", next ?? "");
    startTransition(async () => {
      await assignSectorAction(fd);
    });
  }

  return (
    <select
      defaultValue={currentSector ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="w-full rounded-[6px] border border-[#262a2f] bg-[#111214] px-2.5 py-1.5 text-center text-xs font-medium text-zinc-200 outline-none disabled:opacity-60"
    >
      <option value="">Unassigned</option>
      {SECTORS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
