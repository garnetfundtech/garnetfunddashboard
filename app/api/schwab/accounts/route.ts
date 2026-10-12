import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireSessionUser } from "@/lib/require-session";
import { canAdministerContent } from "@/lib/roles";
import { loadValidTraderToken } from "@/lib/market-data";
import { getAccountPositions, pickAccount } from "@/lib/schwab";

export const dynamic = "force-dynamic";

/**
 * Which Schwab accounts the linked login can see, and which one the dashboard
 * follows (see pickAccount). For checking a relink or SCHWAB_ACCOUNT_LAST4
 * after an account change. Last four digits only.
 */
export async function GET() {
  const session = await requireSessionUser();
  if (session.response) return session.response;
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "approved" || !canAdministerContent(profile.role)) {
    return NextResponse.json({ ok: false, message: "Admins only." }, { status: 403 });
  }

  const token = await loadValidTraderToken();
  if (!token) return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });

  const raw = await getAccountPositions(token);
  const list = (Array.isArray(raw) ? raw : [raw]).filter((a) => a?.securitiesAccount);
  const followed = pickAccount(raw)?.securitiesAccount?.accountNumber ?? null;
  const setting = process.env.SCHWAB_ACCOUNT_LAST4?.replace(/\D/g, "") ?? "";

  return NextResponse.json({
    ok: true,
    schwabAccountLast4Setting: setting ? `…${setting.slice(-4)}` : "not set",
    accounts: list.map((a) => {
      const sec = a.securitiesAccount;
      const b = sec.currentBalances ?? {};
      const number = String(sec.accountNumber ?? "");
      return {
        account: `…${number.slice(-4)}`,
        type: sec.type ?? null,
        liquidationValue: Number(a.aggregatedBalance?.currentLiquidationValue ?? b.liquidationValue ?? 0),
        cash: Number(b.cashAvailableForTrading ?? 0),
        positions: Array.isArray(sec.positions) ? sec.positions.length : 0,
        followed: number === followed,
      };
    }),
  });
}
