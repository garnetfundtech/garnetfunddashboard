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

/** Same gutter as kpi-strip.tsx — the two components render identical
 *  spacing so tile rows look the same everywhere they appear. */
export function KpiRow({ tiles }: { tiles: KpiTileDef[] }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
    >
      {tiles.map((t, i) => (
        <KpiTileCard key={i} {...t} />
      ))}
    </div>
  );
}

function KpiTileCard({ label, value, sub, spark, badge }: KpiTileDef) {
  return (
    <article className="panel relative overflow-hidden px-3 py-2.5">
      <p className="caps whitespace-nowrap">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2 whitespace-nowrap">
        <span className="stat-value text-[19px] text-ink">{value}</span>
        <div className="flex shrink-0 items-center gap-1">
          {badge}
          {spark && spark.length >= 2 && <Spark data={spark} width={42} height={14} />}
        </div>
      </div>
      {sub && <p className="num mt-1 whitespace-nowrap text-[12.5px] text-ink-3">{sub}</p>}
    </article>
  );
}
