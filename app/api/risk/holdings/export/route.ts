import { requireApprovedProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { csvResponse } from "@/lib/csv";
import { canReadFullRiskBoard } from "@/lib/nav-access";
import type { PositionRow } from "@/lib/risk-engine";
import type { SnapshotPosition } from "@/lib/risk-live";

export const dynamic = "force-dynamic";

/**
 * A bond's quantity is in units of $1,000 face, and its price is per 100 of
 * par — see the cost-basis note in lib/market-data.ts and the one in
 * lib/realized-gains.ts. Face value is therefore quantity × 1,000.
 */
const BOND_UNIT_FACE = 1000;

type SnapshotRow = {
  captured_on: string;
  nav: number | null;
  positions: SnapshotPosition[] | null;
  /** The positions inside the stored model, which also carry the name and
   *  the bond maturity that the slim `positions` column leaves out. */
  model_positions: PositionRow[] | null;
};

/**
 * Dated holdings: the book as of each nightly snapshot, one row per position
 * per day, oldest first, read from risk_snapshots rather than the live feed so
 * every row is what was actually held that day [§6 Storage].
 *
 * Weight is market value ÷ NAV, signed, so a day's rows plus the cash row sum
 * to 100%. That differs from the risk board's weight for an option, which is
 * delta-adjusted exposure — the right figure for a limit, the wrong one for a
 * holdings list.
 */
export async function GET() {
  const profile = await requireApprovedProfile();
  // §6 Access: the whole book is not an analyst's to read.
  if (!canReadFullRiskBoard(profile.role)) {
    return new Response("Not available to your role.", { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("risk_snapshots")
    .select("captured_on, nav, positions, model_positions:model->positions")
    .order("captured_on", { ascending: true });
  if (error) {
    return new Response(`Could not read the holdings history: ${error.message}`, { status: 500 });
  }

  const header = [
    "Date",
    "Identifier",
    "Description",
    "Asset class",
    "Team",
    "Side",
    "Shares / contracts",
    "Face value",
    "Price",
    "Market value",
    "Weight (% of NAV)",
    "Maturity date",
  ];

  const body: unknown[][] = [];
  for (const snap of (data ?? []) as SnapshotRow[]) {
    const nav = Number(snap.nav);
    const weight = (mv: number) => (nav > 0 ? Number(((mv / nav) * 100).toFixed(4)) : "");

    // The model is the fuller record; the slim column covers a day whose
    // model failed to store.
    const rows =
      snap.model_positions?.map((r) => r.position) ??
      snap.positions?.map((p) => ({ ...p, name: "", maturityDate: null })) ??
      [];

    let invested = 0;
    for (const p of rows) {
      const isBond = p.assetClass === "Fixed Income";
      const mv = Number(p.marketValue);
      invested += mv;
      body.push([
        snap.captured_on,
        p.symbol,
        p.name ?? "",
        p.assetClass,
        p.team,
        p.side,
        isBond ? "" : Number(p.quantity),
        isBond ? Math.abs(Number(p.quantity)) * BOND_UNIT_FACE : "",
        Number(p.price),
        mv,
        weight(mv),
        p.maturityDate ? String(p.maturityDate).slice(0, 10) : "",
      ]);
    }

    // Cash is not a position in the feed, so it is the remainder of NAV. It
    // also absorbs anything else the broker counts in NAV, which is why it
    // is labelled as a residual rather than a cash balance.
    if (nav > 0) {
      const residual = nav - invested;
      body.push([
        snap.captured_on,
        "CASH",
        "Cash and other (NAV less positions)",
        "Cash",
        "",
        "",
        "",
        "",
        "",
        Number(residual.toFixed(2)),
        weight(residual),
        "",
      ]);
    }
  }

  return csvResponse(header, body, "garnet-fund-holdings");
}
