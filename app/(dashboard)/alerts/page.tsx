import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AlertsPageClient } from "@/components/dashboard/alerts-page-client";

export type StockAlert = {
  id: string;
  ticker: string;
  companyName: string | null;
  sector: string;
  buyLimit: number | null;
  sellLimit: number | null;
  currentPrice: number | null;
  lastPriceCheck: string | null;
  status: "active" | "triggered_buy" | "triggered_sell" | "dismissed";
  triggeredAt: string | null;
  createdBy: string;
  createdAt: string;
};

export default async function AlertsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("stock_alerts")
    .select(
      "id, ticker, company_name, sector, buy_limit, sell_limit, current_price, last_price_check, status, triggered_at, created_by, created_at",
    )
    .order("created_at", { ascending: false });

  const alerts: StockAlert[] = (data ?? []).map((r) => ({
    id: r.id,
    ticker: r.ticker,
    companyName: r.company_name ?? null,
    sector: r.sector,
    buyLimit: r.buy_limit ?? null,
    sellLimit: r.sell_limit ?? null,
    currentPrice: r.current_price ?? null,
    lastPriceCheck: r.last_price_check ?? null,
    status: (r.status as StockAlert["status"]) ?? "active",
    triggeredAt: r.triggered_at ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));

  return <AlertsPageClient alerts={alerts} currentUserId={profile.id} />;
}
