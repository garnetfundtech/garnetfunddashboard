"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "@/lib/use-click-outside";

/**
 * Shared info-icon tooltip. Shows on hover (desktop) and toggles on click
 * (touch, or anyone who prefers not to hover) — a native `title=` attribute
 * gives neither: it forces the OS tooltip and a help cursor, both outside
 * this app's own styling.
 *
 * The panel renders in a portal on document.body rather than next to the icon.
 * Absolutely positioned inside the card it belongs to, it was clipped by that
 * card's `overflow-hidden` and by the scroll container above it, so the text
 * was cut off mid-sentence — and its z-index could not lift it above the
 * neighbouring cards, because a z-index only orders siblings within the
 * stacking context it sits in. A portal has neither problem: nothing above it
 * can clip it and nothing can paint over it.
 *
 * Position is therefore computed in viewport coordinates and clamped to the
 * window, so a tooltip on the rightmost card opens inward instead of off the
 * edge, and one near the top opens downward instead of above the fold.
 */
const WIDTH = 248;
const MARGIN = 8;

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const place = useCallback(() => {
    const icon = ref.current?.getBoundingClientRect();
    if (!icon) return;
    const height = panelRef.current?.offsetHeight ?? 0;

    // Prefer above the icon; flip below when there is not room for the panel.
    const below = icon.top - height - MARGIN < MARGIN;
    const top = below ? icon.bottom + MARGIN : icon.top - height - MARGIN;

    // Centre on the icon, then pull back inside the viewport on either edge.
    const centred = icon.left + icon.width / 2 - WIDTH / 2;
    const left = Math.min(
      Math.max(MARGIN, centred),
      Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN),
    );
    setPos({ top, left, below });
  }, []);

  // Measured after the panel is in the DOM, so `below` reflects real height.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // A tooltip anchored to a scrolled-away icon would sit orphaned on screen.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="What this measures"
        aria-expanded={open}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center border border-line-2 text-[10px] leading-none text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        i
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={panelRef}
            role="tooltip"
            className="pointer-events-none fixed z-[100] block border border-line-2 bg-surface px-2.5 py-2 text-[12.5px] leading-snug text-ink shadow-[0_4px_14px_rgba(23,24,26,0.16)]"
            style={{
              width: WIDTH,
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              // Hidden until measured, so it never flashes at the wrong place.
              visibility: pos ? "visible" : "hidden",
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
