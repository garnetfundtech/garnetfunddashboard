"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [sector, setSector] = useState<string | null>(currentSector);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  function handleSelect(next: string | null) {
    setOpen(false);
    if (next === sector) return;
    setSector(next);
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("sector", next ?? "");
    startTransition(async () => {
      await assignSectorAction(fd);
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 min-w-[180px] rounded-[9px] border border-white/[0.06] bg-[#08090a] p-1 shadow-2xl">
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs transition-colors hover:bg-zinc-800/70 ${
              sector === null ? "font-medium text-white" : "text-zinc-400"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${sector === null ? "bg-white" : "bg-transparent"}`} />
            Unassigned
          </button>
          {SECTORS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs transition-colors hover:bg-zinc-800/70 ${
                s === sector ? "font-medium text-white" : "text-zinc-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s === sector ? "bg-white" : "bg-transparent"}`} />
              {s}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="glass-input flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-60"
      >
        {isPending ? (
          <span className="text-zinc-500">Saving…</span>
        ) : (
          <>
            {sector ?? "Unassigned"}
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          </>
        )}
      </button>
    </div>
  );
}
