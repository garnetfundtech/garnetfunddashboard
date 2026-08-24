import type { ReactNode } from "react";

/** Fixed height so every primary/ghost button lines up identically across every
 *  page header, regardless of icon or label length. */
const BTN_HEIGHT = "h-9";

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
      className={`inline-flex ${BTN_HEIGHT} items-center gap-1.5 rounded-none bg-garnet px-3.5 text-[14px] font-medium text-white transition-colors hover:bg-garnet-hover disabled:opacity-50`}
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
      className={`inline-flex ${BTN_HEIGHT} items-center gap-1.5 rounded-none border border-line bg-surface px-3.5 text-[14px] text-ink transition-colors hover:bg-paper-2 disabled:opacity-50`}
    >
      {children}
    </button>
  );
}
