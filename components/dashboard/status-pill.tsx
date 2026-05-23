type Tone = "emerald" | "amber" | "blue" | "rose" | "neutral" | "accent";

const toneClasses: Record<Tone, string> = {
  emerald: "border-emerald-400/25 bg-emerald-400/10 text-emerald-400",
  amber: "border-amber-400/25 bg-amber-400/10 text-amber-400",
  blue: "border-blue-400/25 bg-blue-400/10 text-blue-400",
  rose: "border-rose-400/25 bg-rose-400/10 text-rose-400",
  neutral: "border-white/[0.08] bg-white/[0.04] text-zinc-400",
  accent: "border-[var(--gf-accent)]/30 bg-[var(--gf-accent)]/10 text-[var(--gf-accent-fg)]",
};

const dotColors: Record<Tone, string> = {
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  blue: "bg-blue-400",
  rose: "bg-rose-400",
  neutral: "bg-zinc-500",
  accent: "bg-[var(--gf-accent-fg)]",
};

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[10px] font-medium ${toneClasses[tone]}`}
    >
      <span className={`h-1 w-1 rounded-full ${dotColors[tone]}`} />
      {label}
    </span>
  );
}
