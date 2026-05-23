import type { ReactNode } from "react";
import { Spark } from "@/components/dashboard/spark";

export type KpiTileDef = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "pos" | "neg" | null;
  spark?: number[] | null;
  badge?: ReactNode;
};

export function KpiRow({ tiles }: { tiles: KpiTileDef[] }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
    >
      {tiles.map((t, i) => (
        <KpiTileCard key={i} {...t} />
      ))}
    </div>
  );
}

function KpiTileCard({ label, value, sub, tone, spark, badge }: KpiTileDef) {
  const gradientStyle =
    tone === "pos"
      ? { background: "linear-gradient(to top, rgba(52,211,153,0.06), transparent 60%), var(--panel)" }
      : tone === "neg"
        ? { background: "linear-gradient(to top, rgba(251,113,133,0.06), transparent 60%), var(--panel)" }
        : undefined;

  return (
    <article className="panel relative overflow-hidden px-3 py-2" style={gradientStyle}>
      <p className="text-[9.5px] uppercase tracking-[0.08em] text-zinc-500 whitespace-nowrap">{label}</p>
      <div className="mt-0.5 flex items-baseline justify-between gap-2 whitespace-nowrap">
        <span className="text-[15px] font-semibold tabular-nums leading-tight text-white">{value}</span>
        <div className="flex shrink-0 items-center gap-1">
          {badge}
          {spark && spark.length >= 2 && <Spark data={spark} width={42} height={14} />}
        </div>
      </div>
      {sub && <p className="mt-0.5 text-[10.5px] tabular-nums text-zinc-500 whitespace-nowrap">{sub}</p>}
    </article>
  );
}
