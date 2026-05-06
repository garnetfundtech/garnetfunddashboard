import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/require-session";
import { portfolioChatReply } from "@/lib/gemini";
import { fetchPortfolioSummary, fetchAccountOrders } from "@/lib/market-data";
import { normalizeSchwabOrders } from "@/lib/schwab-orders";

export async function POST(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;

  try {
    const body = (await request.json()) as {
      messages?: { role: "user" | "model"; text: string }[];
    };
    const messages = body.messages ?? [];
    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ ok: false, message: "Invalid messages" }, { status: 400 });
    }

    const [portfolio, rawOrders] = await Promise.all([
      fetchPortfolioSummary(),
      fetchAccountOrders(30),
    ]);
    const orders = rawOrders ? normalizeSchwabOrders(rawOrders).slice(0, 25) : [];

    const sectorWeights: Record<string, number> = {};
    for (const p of portfolio?.positions ?? []) {
      const sec = p.sector ?? "Unknown";
      sectorWeights[sec] = (sectorWeights[sec] ?? 0) + (p.weight ?? 0);
    }

    const systemPrompt = `You are a senior portfolio analyst for the USC Garnet Fund, a student-led hedge fund. Answer using only the book context below. If data is missing, say so briefly.

Portfolio snapshot (as of last refresh):
${JSON.stringify(
      {
        liquidationValue: portfolio?.liquidationValue,
        cashAvailable: portfolio?.cashAvailable,
        longMarketValue: portfolio?.longMarketValue,
        unrealizedPnl: portfolio?.unrealizedPnl,
        dayPnl: portfolio?.dayPnl,
        positionCount: portfolio?.positionCount,
        positions: (portfolio?.positions ?? []).map((x) => ({
          ticker: x.ticker,
          name: x.name,
          qty: x.quantity,
          avgCost: x.avgCost,
          price: x.currentPrice,
          mktVal: x.marketValue,
          unrealPnl: x.unrealizedPnl,
          weightPct: x.weight,
          sector: x.sector,
        })),
        sectorWeightsPct: sectorWeights,
        recentOrders: orders,
      },
      null,
      2,
    )}

Be concise, institutional, and risk-aware.`;

    const text = await portfolioChatReply(systemPrompt, messages);
    return NextResponse.json({ ok: true, text });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Chat failed" },
      { status: 500 },
    );
  }
}
