import type { ReactNode } from "react";

export type Tone = "emerald" | "amber" | "blue" | "rose" | "neutral" | "accent";

const toneClasses: Record<Tone, string> = {
  emerald: "border-pos-line bg-pos-soft text-pos",
  amber: "border-warn-line bg-warn-soft text-warn",
  blue: "border-info-line bg-info-soft text-info",
  rose: "border-neg-line bg-neg-soft text-neg",
  neutral: "border-line bg-paper-2 text-ink-2",
  accent: "border-garnet-line bg-garnet-soft text-garnet",
};

const dotColors: Record<Tone, string> = {
  emerald: "bg-pos",
  amber: "bg-warn",
  blue: "bg-info",
  rose: "bg-neg",
  neutral: "bg-ink-3",
  accent: "bg-garnet",
};

/**
 * The one tag/badge treatment for the whole app — status pills, file-type
 * chips, report tags, ticker chips, BUY/SELL, source badges. Every other tag
 * implementation was a one-off with its own padding/size/weight; this is the
 * single shape all of them render through now.
 */
export function StatusPill({
  label,
  tone = "neutral",
  dot = true,
  icon,
}: {
  label: ReactNode;
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-none border px-2 py-[2px] text-[12px] font-medium ${toneClasses[tone]}`}
    >
      {icon}
      {dot && !icon && <span className={`h-1 w-1 rounded-none ${dotColors[tone]}`} />}
      {label}
    </span>
  );
}
