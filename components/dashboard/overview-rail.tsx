export function OverviewRail() {
  return (
    <aside className="space-y-3">
      <section className="panel p-3">
        <p className="caps-label">Market Recap</p>
        <h3 className="mt-1 text-base font-semibold text-white">Daily Brief</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Portfolio feeds are connected. Live metrics will populate once Schwab sync is enabled.
        </p>
      </section>
      <section className="panel glass-stat glass-stat-positive p-3">
        <p className="caps-label">Cash Position</p>
        <p className="mt-2 text-2xl font-semibold text-white">$0</p>
        <p className="text-sm text-emerald-400">0.0% allocation</p>
      </section>
      <section className="panel glass-stat glass-stat-negative p-3">
        <p className="caps-label">Risk Monitor</p>
        <p className="mt-2 text-2xl font-semibold text-white">0.00</p>
        <p className="text-sm text-[#d88f8d]">Tracking error pending live series</p>
      </section>
    </aside>
  );
}
