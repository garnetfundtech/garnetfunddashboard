import { OrdersTableClient } from "@/components/dashboard/orders-table-client";
import { enforceNavAccess } from "@/lib/dashboard-guard";

export default async function OrdersPage() {
  await enforceNavAccess("/orders");

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Orders &amp; trade history</h1>
      <OrdersTableClient />
    </div>
  );
}
