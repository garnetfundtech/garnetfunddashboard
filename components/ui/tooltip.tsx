"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/lib/use-click-outside";

/**
 * Shared info-icon tooltip. Shows on hover (desktop) and toggles on click
 * (touch, or anyone who prefers not to hover) — a native `title=` attribute
 * gives neither: it forces the OS tooltip and a help cursor, both outside
 * this app's own styling.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  return (
    <span ref={ref} className="relative inline-flex">
      <span
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center border border-line-2 text-[10px] text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        i
      </span>
      {open && (
        <span className="absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 border border-line-2 bg-surface px-2.5 py-2 text-[12.5px] leading-snug text-ink shadow-[0_2px_8px_rgba(23,24,26,0.12)]">
          {text}
        </span>
      )}
    </span>
  );
}
