/**
 * Shared skeleton primitives for per-route loading.tsx files. Each route's
 * skeleton composes these into the actual shape of that page — a KPI row,
 * then a table or a multi-panel layout — so the instant-nav placeholder
 * looks like the page you're navigating to, not a generic spinner shape.
 *
 * No header skeleton here on purpose: the title/meta/actions row now lives in
 * the layout's DashboardTopRow (see page-header-context.tsx), outside the
 * per-route loading boundary — it's already showing (or already cleared to
 * blank on navigation) before this skeleton ever mounts, so a second fake
 * header here would just double up.
 */

export function SkeletonKpiRow({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel px-3 py-2.5">
          <div className="h-2.5 w-16 bg-paper-2" />
          <div className="mt-2 h-4 w-14 bg-paper-2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="panel flex-1 overflow-hidden">
      <div className="border-b border-line-2 bg-paper-3 px-3 py-2.5">
        <div className="h-3 w-28 bg-paper-2" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-2.5">
            <div className="h-3 w-24 bg-paper-2" />
            <div className="h-3 w-16 bg-paper-2" />
            <div className="ml-auto h-3 w-12 bg-paper-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonPanel({ className = "" }: { className?: string }) {
  return <div className={`panel ${className}`} />;
}

/** Standard shell: header, KPI row, one table filling the rest. Covers most list pages. */
export function SkeletonListPage({ kpiCount = 5 }: { kpiCount?: number }) {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <SkeletonKpiRow count={kpiCount} />
      <SkeletonTable />
    </div>
  );
}
