import { metricCards } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function MetricGrid() {
  return (
    <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {metricCards.map((metric) => (
        <article
          key={metric.label}
          className={cn(
            "panel glass-stat p-3",
            metric.positive ? "glass-stat-positive" : "glass-stat-negative",
          )}
        >
          <p className="caps-label">{metric.label}</p>
          <p className="mt-1 text-xl font-semibold text-white">{metric.value}</p>
          <p
            className={cn(
              "mt-0.5 text-xs",
              metric.positive ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {metric.delta}
          </p>
        </article>
      ))}
    </section>
  );
}
