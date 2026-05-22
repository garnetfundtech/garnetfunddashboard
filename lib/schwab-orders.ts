export type NormalizedOrderRow = {
  orderId: string;
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  fillPrice: number;
  status: string;
  timestamp: string;
};

/** Normalize Schwab Trader API `GET /accounts/{hash}/orders` JSON array */
export function normalizeSchwabOrders(raw: unknown): NormalizedOrderRow[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedOrderRow[] = [];

  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const legs = (o.orderLegCollection ?? []) as Record<string, unknown>[];
    const leg0 = legs[0] ?? {};
    const inst = leg0.instrument as Record<string, unknown> | undefined;
    const symbol = String(inst?.symbol ?? "").toUpperCase();
    const instruction = String(leg0.instruction ?? "").toUpperCase();
    const side: "BUY" | "SELL" = instruction.includes("SELL") ? "SELL" : "BUY";
    const qty = Number(o.filledQuantity ?? leg0.quantity ?? 0);

    // Schwab returns fill price in multiple places depending on order type / state.
    // Prefer averageFilledPrice → executionLegs price → order-level price (limit) → 0.
    let fillPrice = Number(o.averageFilledPrice ?? 0);
    if (!fillPrice || !Number.isFinite(fillPrice)) {
      const activities = (o.orderActivityCollection ?? []) as Record<string, unknown>[];
      const exLegs = (activities[0]?.executionLegs ?? []) as Record<string, unknown>[];
      const px = Number(exLegs[0]?.price ?? 0);
      if (px && Number.isFinite(px)) fillPrice = px;
    }
    if (!fillPrice || !Number.isFinite(fillPrice)) {
      fillPrice = Number(o.price ?? 0);
    }

    const status = String(o.status ?? "");
    const timestamp = String(o.closeTime ?? o.enteredTime ?? "");
    const orderId = String(o.orderId ?? "");
    if (!orderId) continue;
    out.push({
      orderId,
      ticker: symbol || "—",
      side,
      quantity: qty,
      fillPrice,
      status,
      timestamp,
    });
  }

  return out;
}
