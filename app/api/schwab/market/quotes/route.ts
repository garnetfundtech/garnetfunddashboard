import { NextRequest, NextResponse } from "next/server";
import { getValidTraderToken } from "@/lib/market-data";
import { getQuotes } from "@/lib/schwab";

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ ok: false, message: "symbols param required" }, { status: 400 });
  }

  const token = await getValidTraderToken();
  if (!token) {
    return NextResponse.json({ ok: false, message: "No valid Schwab token." }, { status: 401 });
  }

  try {
    const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const data = await getQuotes(token, symbols);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Quotes failed" },
      { status: 500 },
    );
  }
}
