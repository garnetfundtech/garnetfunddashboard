/**
 * Instant loading skeleton for every dashboard page. Without this, a sidebar
 * click blocks on the full server render (auth + data fetches) before anything
 * changes on screen — this streams a shell immediately instead.
 */
export default function DashboardLoading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-2">
      {/* header strip */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-2.5 w-16 rounded-none bg-paper-2" />
          <div className="mt-2 h-5 w-44 rounded-none bg-paper-2" />
        </div>
        <div className="h-7 w-28 rounded-none bg-paper-2" />
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel h-[60px] px-2.5 py-2">
            <div className="h-2 w-14 rounded-none bg-paper-2" />
            <div className="mt-2 h-4 w-20 rounded-none bg-paper-2" />
          </div>
        ))}
      </div>
      {/* main panels */}
      <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-3" style={{ height: 280 }}>
        <div className="panel lg:col-span-2" />
        <div className="panel" />
      </div>
      <div className="panel min-h-0 flex-1" />
    </div>
  );
}
