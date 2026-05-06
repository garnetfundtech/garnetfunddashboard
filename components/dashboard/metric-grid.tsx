import { metricCards } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function MetricGrid() {
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metricCards.map((metric) => (
        <article key={metric.label} className="panel p-4">
          <p className="caps-label">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
          <p
            className={cn(
              "mt-1 text-sm",
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
