/**
 * Derived facts that only the stored record can supply.
 *
 * Three things the spec asks for cannot be read off a live broker snapshot,
 * because they are statements about the past rather than about right now:
 *
 *   §4.1  Alternatives net theta is judged on its 20-day average, not on the
 *         day's reading. "The IPS requirement is positive theta on average."
 *   §4.2  Entry date and holding period.
 *   §5.1  Realized P&L, in dollars, total and by team.
 *
 * All three read stored data rather than recomputing from a live feed, which
 * is what §6 Storage requires of anything that lands in an audited report.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { Team } from "@/lib/risk-engine";

/**
 * The team a closed position belonged to.
 *
 * Prefers the Risk Manager's own tag on the approval record, including a
 * closed one. Falls back to the same rule lib/risk-engine.ts uses for live
 * positions — an OSI option symbol is Alternatives, anything else is
 * Equities — so a realized gain is attributed by exactly the rule that
 * governed the position while it was open.
 */
function teamFromSymbol(symbol: string, tagged: Map<string, Team>): Team {
  const tag = tagged.get(symbol.toUpperCase());
  if (tag) return tag;
  return /^.{1,6}\s*\d{6}[CP]\d{8}$/.test(symbol.trim()) ? "alternatives" : "equities";
}

export type RealizedPnl = {
  total: number | null;
  byTeam: { team: Team; realized: number }[];
  /** Closed lots behind the figure, so a report can say how it was reached. */
  count: number;
};

/** §5.1 realized P&L over a period, total and split by team. */
export async function getRealizedPnl(from: string | null): Promise<RealizedPnl> {
  const empty: RealizedPnl = { total: null, byTeam: [], count: 0 };
  try {
    const admin = createAdminClient();
    let query = admin.from("realized_gains").select("ticker, gain_loss, filled_at");
    if (from) query = query.gte("filled_at", `${from}T00:00:00Z`);
    const { data, error } = await query;
    if (error || !data) return empty;
    if (!data.length) return { total: 0, byTeam: [], count: 0 };

    const { data: approvals } = await admin
      .from("position_approvals")
      .select("symbol, team")
      .not("team", "is", null);
    const tagged = new Map<string, Team>(
      (approvals ?? []).map((a) => [String(a.symbol).toUpperCase(), a.team as Team]),
    );

    const totals = new Map<Team, number>();
    let total = 0;
    for (const row of data as { ticker: string; gain_loss: number | null }[]) {
      const gain = Number(row.gain_loss ?? 0);
      if (!Number.isFinite(gain)) continue;
      total += gain;
      const team = teamFromSymbol(row.ticker, tagged);
      totals.set(team, (totals.get(team) ?? 0) + gain);
    }

    return {
      total,
      byTeam: [...totals.entries()].map(([team, realized]) => ({ team, realized })),
      count: data.length,
    };
  } catch {
    return empty;
  }
}

/**
 * §4.1 Alternatives net theta, averaged over the trailing window.
 *
 * Reads `risk_snapshots.net_theta`, which the daily cron has been writing
 * since go-live. Returns null rather than a shorter average when fewer days
 * exist than the window asks for — a "20-day average" computed from four days
 * is not a rougher number, it is a different one, and this is the value the
 * monitor's colour is judged on.
 */
export async function getThetaAverage(
  windowDays = 20,
): Promise<{ average: number | null; observations: number }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("risk_snapshots")
      .select("net_theta")
      .not("net_theta", "is", null)
      .order("captured_on", { ascending: false })
      .limit(windowDays);
    if (error || !data) return { average: null, observations: 0 };

    const values = data
      .map((r) => Number(r.net_theta))
      .filter((n) => Number.isFinite(n));
    if (values.length < windowDays) return { average: null, observations: values.length };

    return {
      average: values.reduce((s, v) => s + v, 0) / values.length,
      observations: values.length,
    };
  } catch {
    return { average: null, observations: 0 };
  }
}

export type EntryRecord = { entryDate: string; source: "snapshot" | "order" };

/**
 * §4.2 entry date per open position, for the holding period and the
 * post-mortem record.
 *
 * The broker's position feed carries no entry date, so this reconstructs it
 * two ways, in order of authority:
 *
 *   snapshot — the first day of the unbroken run of daily snapshots in which
 *              the symbol appears. Exact, and reproducible from stored data
 *              the way §6 requires. A position closed and reopened gives the
 *              reopen date, which is the correct answer.
 *   order    — the earliest opening fill in `order_history`, used only when
 *              the symbol is present in the oldest snapshot we hold, meaning
 *              the position predates our record.
 *
 * A symbol neither source reaches is omitted, and the column shows a dash.
 * Nothing here is inferred from the current holding alone.
 */
export async function getEntryDates(symbols: string[]): Promise<Map<string, EntryRecord>> {
  const out = new Map<string, EntryRecord>();
  if (!symbols.length) return out;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("risk_snapshots")
      .select("captured_on, positions")
      .not("positions", "is", null)
      .order("captured_on", { ascending: false })
      .limit(400);

    const rows = (data ?? []) as {
      captured_on: string;
      positions: { symbol?: string; ticker?: string }[];
    }[];

    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    const predatesRecord = new Set<string>();

    if (rows.length) {
      // Walk newest → oldest. A symbol's run ends at the first day it is
      // absent; the day before that absence is its entry date.
      const running = new Map<string, string>();
      const closed = new Set<string>();

      for (const row of rows) {
        const present = new Set(
          (row.positions ?? []).map((p) => String(p.symbol ?? p.ticker ?? "").toUpperCase()),
        );
        for (const symbol of wanted) {
          if (closed.has(symbol)) continue;
          if (present.has(symbol)) running.set(symbol, row.captured_on);
          else closed.add(symbol);
        }
      }

      const oldest = rows[rows.length - 1];
      const inOldest = new Set(
        (oldest.positions ?? []).map((p) => String(p.symbol ?? p.ticker ?? "").toUpperCase()),
      );

      for (const [symbol, date] of running) {
        // Present on the oldest day we hold: the run is truncated by our
        // record, not by the position actually opening then.
        if (inOldest.has(symbol) && !closed.has(symbol)) predatesRecord.add(symbol);
        else out.set(symbol, { entryDate: date, source: "snapshot" });
      }
      for (const symbol of wanted) {
        if (!running.has(symbol)) predatesRecord.add(symbol);
      }
    } else {
      for (const symbol of wanted) predatesRecord.add(symbol);
    }

    if (predatesRecord.size) {
      const { data: orders } = await admin
        .from("order_history")
        .select("ticker, side, order_time")
        .in("ticker", [...predatesRecord])
        .eq("side", "BUY")
        .order("order_time", { ascending: true });

      for (const order of (orders ?? []) as { ticker: string; order_time: string }[]) {
        const symbol = order.ticker.toUpperCase();
        if (out.has(symbol)) continue;
        out.set(symbol, { entryDate: order.order_time.slice(0, 10), source: "order" });
      }
    }
  } catch {
    /* no stored history — the column shows a dash, which is the honest answer */
  }

  return out;
}
