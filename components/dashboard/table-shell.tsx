import type { ReactNode } from "react";

export function TableShell({
  kicker,
  title,
  count,
  actions,
  footer,
  children,
}: {
  kicker?: string;
  title: string;
  count?: number | string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2">
        <div className="flex items-baseline gap-1.5">
          {kicker && (
            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{kicker}</span>
          )}
          <span className="text-[13.5px] font-semibold text-white">{title}</span>
          {count != null && (
            <span className="ml-0.5 text-[11px] font-normal tabular-nums text-zinc-500">({count})</span>
          )}
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
      {footer && (
        <div className="border-t border-white/[0.04] px-3 py-1.5 text-[10.5px] text-zinc-500">{footer}</div>
      )}
    </div>
  );
}
