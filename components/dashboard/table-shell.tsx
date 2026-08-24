import type { ReactNode } from "react";

export function TableShell({
  kicker,
  title,
  count,
  actions,
  footer,
  children,
  className = "",
}: {
  kicker?: string;
  title: string;
  count?: number | string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line-2 bg-paper-3 px-3 py-2">
        <div className="flex items-baseline gap-2">
          {kicker && <span className="caps text-[11px]">{kicker}</span>}
          <span className="panel-title">{title}</span>
          {count != null && (
            <span className="num text-[12.5px] text-ink-3">({count})</span>
          )}
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
      {footer && (
        <div className="border-t border-line px-3 py-1.5 text-[12px] text-ink-3">{footer}</div>
      )}
    </div>
  );
}
