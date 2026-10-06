import { NextResponse } from "next/server";
import { getValidTraderToken } from "@/lib/market-data";
import { getAccountNumbers, getAccountOrders } from "@/lib/schwab";
import { normalizeSchwabOrders } from "@/lib/schwab-orders";
import { requireSessionUser } from "@/lib/require-session";
import { syncRealizedGains } from "@/lib/realized-gains";

/**
 * Recomputes realized_gains from the last 90 days of fills. The same work
 * runs on the nightly order sync and, throttled, on portfolio loads; this is
 * the manual way to force it. See lib/realized-gains.ts.
 */
export async function POST() {
  const { user, response } = await requireSessionUser();
  if (!user) return response!;

  const token = await getValidTraderToken();
  if (!token) {
    return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });
  }

  try {
    const accounts = await getAccountNumbers(token);
    const hash = accounts[0]?.hashValue;
    if (!hash) throw new Error("No account hash found.");
    const orders = normalizeSchwabOrders(await getAccountOrders(token, hash, 90));
    const { upserted } = await syncRealizedGains(orders);
    return NextResponse.json({ ok: true, upserted });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Realized gains sync failed." },
      { status: 500 },
    );
  }
}
