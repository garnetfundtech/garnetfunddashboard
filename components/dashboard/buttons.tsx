import type { ReactNode } from "react";

export function PrimaryBtn({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--gf-accent)] px-3 py-2 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--gf-border)] bg-[var(--gf-panel)] px-3 py-2 text-[12.5px] text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}
