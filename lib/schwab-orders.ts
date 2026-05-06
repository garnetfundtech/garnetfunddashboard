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
    const fillPrice = Number(o.averageFilledPrice ?? 0);
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
