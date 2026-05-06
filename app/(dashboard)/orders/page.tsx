import { OrdersPageClient } from "@/components/dashboard/orders-page-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";

export default async function OrdersPage() {
  await enforceNavAccess("/orders");

  return (
    <OrdersPageClient />
  );
}
