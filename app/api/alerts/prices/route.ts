import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/require-session";
import { getValidTraderToken } from "@/lib/market-data";
import { getQuotes } from "@/lib/schwab";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsEmail } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";

export async function POST(request: NextRequest) {
  const { user, response } = await requireSessionUser();
  if (!user) return response!;

  const body = (await request.json()) as { tickers?: string[] };
  const tickers = (body.tickers ?? []).filter(Boolean).slice(0, 50);
  if (!tickers.length) {
    return NextResponse.json({ ok: true, prices: {} });
  }

  const token = await getValidTraderToken();
  if (!token) {
    return NextResponse.json({ ok: true, prices: {} });
  }

  try {
    const quotes = await getQuotes(token, tickers);
    const prices: Record<string, number> = {};
    for (const [ticker, data] of Object.entries(quotes)) {
      const price = data.quote?.lastPrice;
      if (price != null) prices[ticker] = price;
    }

    // Update current_price and check limits for each ticker
    const admin = createAdminClient();
    const { data: alerts } = await admin
      .from("stock_alerts")
      .select("id, ticker, company_name, buy_limit, sell_limit, status")
      .in("ticker", Object.keys(prices))
      .eq("status", "active");

    const fired: string[] = [];
    if (alerts?.length) {
      await Promise.all(
        alerts.map(async (alert) => {
          const price = prices[alert.ticker];
          if (price == null) return;

          const buyLimit = alert.buy_limit as number | null;
          const sellLimit = alert.sell_limit as number | null;

          let newStatus = "active";
          if (sellLimit != null && price >= sellLimit) newStatus = "triggered_sell";
          else if (buyLimit != null && price <= buyLimit) newStatus = "triggered_buy";

          // Matching on status as well as id means only the request that
          // actually moves the alert off "active" sees a row back, so two
          // open dashboards polling together cannot both send the email.
          const { data: updated } = await admin
            .from("stock_alerts")
            .update({
              current_price: price,
              last_price_check: new Date().toISOString(),
              status: newStatus,
              triggered_at: newStatus !== "active" ? new Date().toISOString() : null,
            })
            .eq("id", alert.id)
            .eq("status", "active")
            .select("id");

          if (newStatus !== "active" && updated?.length) {
            const side = newStatus === "triggered_sell" ? "sell" : "buy";
            const limit = side === "sell" ? sellLimit : buyLimit;
            const name = alert.company_name ? ` (${alert.company_name})` : "";
            fired.push(`${alert.ticker}${name} hit its ${side} limit of $${limit}: last $${price.toFixed(2)}`);
          }
        }),
      );

      if (fired.length) {
        await sendOpsEmail({
          to: [],
          subject:
            fired.length === 1
              ? `Price alert: ${fired[0].split(" ")[0]}`
              : `Price alerts: ${fired.length} triggered`,
          text: `${fired.join("\n")}\n\n${siteUrl()}/alerts`,
        }).catch(() => undefined);
      }

      // Also update prices for already-triggered alerts (without changing status)
      const { data: triggered } = await admin
        .from("stock_alerts")
        .select("id, ticker")
        .in("ticker", Object.keys(prices))
        .in("status", ["triggered_buy", "triggered_sell"]);

      if (triggered?.length) {
        await Promise.all(
          triggered.map((a) => {
            const price = prices[a.ticker];
            if (price == null) return Promise.resolve();
            return admin
              .from("stock_alerts")
              .update({ current_price: price, last_price_check: new Date().toISOString() })
              .eq("id", a.id);
          }),
        );
      }
    }

    return NextResponse.json({ ok: true, prices });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Price fetch failed" },
      { status: 500 },
    );
  }
}
