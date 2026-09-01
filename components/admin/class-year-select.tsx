"use client";

import { useTransition } from "react";
import { updateUserClassYearAction } from "@/app/(dashboard)/admin/actions";
import { CLASS_YEARS } from "@/lib/class-years";

export function ClassYearSelect({
  userId,
  currentYear,
}: {
  userId: string;
  currentYear: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("classYear", e.target.value);
    startTransition(async () => {
      await updateUserClassYearAction(fd);
    });
  }

  return (
    <select
      defaultValue={currentYear ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="w-full rounded-none border border-line bg-surface px-2.5 py-1.5 text-center text-xs font-medium text-ink outline-none disabled:opacity-60"
    >
      <option value="">Unset</option>
      {CLASS_YEARS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
