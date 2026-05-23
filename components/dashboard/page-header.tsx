import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {kicker && (
          <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{kicker}</p>
        )}
        <h1 className="text-[20px] font-semibold tracking-tight text-white whitespace-nowrap">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-zinc-400">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}
