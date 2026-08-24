/**
 * Episode tracking and the breach log — the two backend pieces the risk
 * alert spec calls "the most important rule in the document" and "the audit
 * trail for the bylaws."
 *
 * One notification per episode, not per check: an item notifies when it
 * enters a state, then goes silent until it returns to green and resets.
 * Escalating yellow → red on the same item sends one more, because that's
 * genuinely new information. Every red also writes a permanent breach-log
 * row with a drift-vs-trade classification, worked out by diffing today's
 * position snapshot against the prior day's.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { RiskModel, EvaluatedRow } from "@/lib/risk-engine";
import { sendNotification } from "@/lib/notify";

// Items that notify on yellow, not just red — they drift on their own and
// are slow to reverse, so the warning has to come before the breach.
const NOTIFY_ON_YELLOW = new Set(["max-short-weight", "net-beta", "net-exposure", "drawdown-from-high"]);

const INTRADAY_ITEMS = new Set(["single-day-move"]);

// Net exposure's red state carries a 2-trading-day rebalance countdown per
// the spec. Approximated in calendar days — a holiday-aware trading
// calendar is a reasonable follow-up, not a blocker for this to work.
const COUNTDOWN_ITEMS = new Set(["net-exposure"]);
const COUNTDOWN_DAYS = 2;

type EpisodeRow = {
  limit_id: string;
  status: string;
  entered_at: string;
  last_notified_at: string | null;
  countdown_expires_at: string | null;
};

async function classifyDriftOrTrade(): Promise<"drift" | "trade" | "unknown"> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("risk_snapshots")
      .select("captured_on, positions")
      .not("positions", "is", null)
      .order("captured_on", { ascending: false })
      .limit(2);

    if (!data || data.length < 2) return "unknown";
    const [today, yesterday] = data as { captured_on: string; positions: { ticker: string; quantity: number }[] }[];

    const yQty = new Map(yesterday.positions.map((p) => [p.ticker, p.quantity]));
    for (const p of today.positions) {
      const prior = yQty.get(p.ticker);
      if (prior == null || Math.abs(prior - p.quantity) > 1e-6) return "trade";
    }
    // Any ticker that vanished entirely was also a trade (a full exit).
    const tQty = new Set(today.positions.map((p) => p.ticker));
    for (const ticker of yQty.keys()) {
      if (!tQty.has(ticker)) return "trade";
    }
    return "drift";
  } catch {
    return "unknown";
  }
}

/**
 * Runs episode transition detection over every row in today's model, fires
 * notifications for genuinely new episodes, and logs every red to the
 * breach log. Call once per day (from the snapshot cron) for the
 * close-of-day batch; call more often intraday if a fast single-day-move
 * check is wired up separately.
 */
export async function evaluateEpisodes(
  model: RiskModel,
  opts: { onlyItemIds?: string[] } = {},
): Promise<{ notified: number; logged: number }> {
  const admin = createAdminClient();
  let allRows: EvaluatedRow[] = model.groups.flatMap((g) => g.rows);
  if (opts.onlyItemIds) {
    const only = new Set(opts.onlyItemIds);
    allRows = allRows.filter((r) => only.has(r.limit.id));
  }

  const { data: episodeRows } = await admin.from("risk_episodes").select("*");
  const episodes = new Map<string, EpisodeRow>((episodeRows ?? []).map((e) => [e.limit_id, e as EpisodeRow]));

  let notified = 0;
  let logged = 0;
  let driftOrTrade: "drift" | "trade" | "unknown" | null = null;

  for (const row of allRows) {
    const id = row.limit.id;
    const status = row.status;
    const prior = episodes.get(id);
    const priorStatus = prior?.status ?? "green";
    const isNewEpisode = status !== priorStatus;

    const shouldNotifyYellow = status === "yellow" && NOTIFY_ON_YELLOW.has(id) && isNewEpisode;
    const shouldNotifyRed = status === "red" && isNewEpisode;
    const isIntraday = INTRADAY_ITEMS.has(id);

    if (shouldNotifyRed || shouldNotifyYellow) {
      const message = `${row.limit.label} entered ${status.toUpperCase()}: ${row.display} (target ${row.limit.target}).`;
      await sendNotification({ limitId: id, status, message }, { intraday: isIntraday });
      notified++;
    }

    if (status === "red") {
      if (driftOrTrade === null) driftOrTrade = await classifyDriftOrTrade();
      if (isNewEpisode) {
        await admin.from("risk_breach_log").insert({
          limit_id: id,
          limit_label: row.limit.label,
          target: row.limit.target,
          actual_value: row.value,
          drift_or_trade: driftOrTrade,
        });
        logged++;
      }
    }

    // Net exposure's countdown: starts the moment it goes red, escalates if
    // still red once it expires, clears the moment it leaves red.
    let countdownExpiresAt = prior?.countdown_expires_at ?? null;
    if (COUNTDOWN_ITEMS.has(id)) {
      if (status === "red" && isNewEpisode) {
        countdownExpiresAt = new Date(Date.now() + COUNTDOWN_DAYS * 86_400_000).toISOString();
      } else if (status === "red" && countdownExpiresAt && new Date(countdownExpiresAt) < new Date()) {
        await sendNotification({
          limitId: id,
          status: "red",
          message: `${row.limit.label} has been outside policy for ${COUNTDOWN_DAYS} trading days without resolving — escalating.`,
        });
        notified++;
        // Push the clock forward so this doesn't refire every run until it resolves.
        countdownExpiresAt = new Date(Date.now() + COUNTDOWN_DAYS * 86_400_000).toISOString();
      } else if (status !== "red") {
        countdownExpiresAt = null;
      }
    }

    await admin.from("risk_episodes").upsert(
      {
        limit_id: id,
        status,
        entered_at: isNewEpisode ? new Date().toISOString() : (prior?.entered_at ?? new Date().toISOString()),
        last_notified_at: shouldNotifyRed || shouldNotifyYellow ? new Date().toISOString() : (prior?.last_notified_at ?? null),
        countdown_expires_at: countdownExpiresAt,
      },
      { onConflict: "limit_id" },
    );
  }

  return { notified, logged };
}
