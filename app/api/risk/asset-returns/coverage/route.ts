import { NextResponse, type NextRequest } from "next/server";
import { requireApprovedProfile } from "@/lib/auth";
import { canReadFullRiskBoard } from "@/lib/nav-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAdjustedCloses, type AdjustedCloses } from "@/lib/fmp";
import { loadValidTraderToken } from "@/lib/market-data";
import { getPriceHistory } from "@/lib/schwab";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Trades every US trading day, so its dates are the calendar gaps are measured against. */
const CALENDAR_SYMBOL = "SPY";

type Kind = "Equity / fund" | "Option" | "Bond" | "Cash" | "Unknown";

/** An OSI option symbol: root padded to six, then YYMMDD, C or P, strike × 1000. */
const OPTION_SYMBOL = /^[A-Z.]{1,6}\s*\d{6}[CP]\d{8}$/;
/** A CUSIP, which is how the feed identifies a bond. */
const CUSIP = /^[0-9]{3}[0-9A-Z]{5}[0-9]$/;

function kindOf(symbol: string, assetClass: string | null): Kind {
  switch (assetClass) {
    case "Option":
      return "Option";
    case "Fixed Income":
      return "Bond";
    case "Cash":
      return "Cash";
    case "Equity":
      return "Equity / fund";
  }
  if (OPTION_SYMBOL.test(symbol)) return "Option";
  if (CUSIP.test(symbol)) return "Bond";
  return /^[A-Z.\-]{1,6}$/.test(symbol) ? "Equity / fund" : "Unknown";
}

type Asset = {
  symbol: string;
  kind: Kind;
  seenIn: Set<"snapshots" | "orders">;
  firstHeld: string | null;
  lastHeld: string | null;
};

/**
 * Which assets the fund has ever held can be given a market-based daily total
 * return series, and where those series have holes — the step before building
 * the correlation matrix and PCA, so a gap is known about rather than
 * discovered as a missing column.
 *
 * The asset list is every symbol in the nightly snapshots and the order
 * history. Each is tested against FMP's dividend-adjusted closes over the
 * window, and gaps are counted against the trading calendar (SPY's dates).
 * Where FMP has nothing, Schwab's price history is tried, but it is price
 * only: on its own it is not a total return, and says so.
 *
 * Nothing is filled in. A missing day is reported as missing.
 *
 * `?from=YYYY-MM-DD` sets the start of the window (default one year back).
 */
export async function GET(request: NextRequest) {
  const profile = await requireApprovedProfile();
  if (!canReadFullRiskBoard(profile.role)) {
    return new Response("Not available to your role.", { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fromParam = request.nextUrl.searchParams.get("from");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam ?? "")
    ? fromParam!
    : new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

  // ── The universe: everything ever held or traded ──────────────────────────
  const admin = createAdminClient();
  const [snaps, orders] = await Promise.all([
    admin.from("risk_snapshots").select("captured_on, positions").order("captured_on", { ascending: true }),
    admin.from("order_history").select("ticker"),
  ]);
  if (snaps.error || orders.error) {
    return NextResponse.json(
      { ok: false, message: snaps.error?.message ?? orders.error?.message },
      { status: 500 },
    );
  }

  const assets = new Map<string, Asset>();
  const touch = (symbol: string, assetClass: string | null) => {
    const key = symbol.trim();
    const existing = assets.get(key);
    if (existing) {
      if (existing.kind === "Unknown" && assetClass) existing.kind = kindOf(key, assetClass);
      return existing;
    }
    const asset: Asset = { symbol: key, kind: kindOf(key, assetClass), seenIn: new Set(), firstHeld: null, lastHeld: null };
    assets.set(key, asset);
    return asset;
  };

  for (const snap of (snaps.data ?? []) as { captured_on: string; positions: { symbol: string; assetClass?: string }[] | null }[]) {
    for (const p of snap.positions ?? []) {
      if (!p?.symbol) continue;
      const a = touch(p.symbol, p.assetClass ?? null);
      a.seenIn.add("snapshots");
      a.firstHeld ??= snap.captured_on;
      a.lastHeld = snap.captured_on;
    }
  }
  for (const o of (orders.data ?? []) as { ticker: string }[]) {
    if (o.ticker) touch(o.ticker, null).seenIn.add("orders");
  }

  // ── The trading calendar ──────────────────────────────────────────────────
  const calendarSeries = await fetchAdjustedCloses(CALENDAR_SYMBOL, from, today);
  const calendar = calendarSeries.closes.map((c) => c.date);
  const fmpUsable = calendar.length > 0;

  const token = await loadValidTraderToken();

  // FMP's lower plans rate-limit bursts, so a few at a time.
  const list = [...assets.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const results: unknown[] = [];
  for (let i = 0; i < list.length; i += 4) {
    const batch = await Promise.all(list.slice(i, i + 4).map((a) => assess(a)));
    results.push(...batch);
  }

  async function assess(a: Asset) {
    const base = {
      symbol: a.symbol,
      kind: a.kind,
      seenIn: [...a.seenIn],
      firstHeld: a.firstHeld,
      lastHeld: a.lastHeld,
    };

    if (a.kind === "Cash") {
      return { ...base, verdict: "excluded", notes: ["Cash has no market return series."] };
    }

    // An option or bond identifier will not resolve at FMP; asking anyway
    // costs a request per asset and proves nothing, so it is reported as a
    // gap with the reason.
    if (a.kind === "Option") {
      return {
        ...base,
        verdict: "no market source",
        notes: [
          "No daily total return history for option contracts in FMP or Schwab's price history.",
          "Options are short-lived and change character as they near expiry; most PCA work uses the underlying instead.",
        ],
      };
    }
    if (a.kind === "Bond") {
      return {
        ...base,
        verdict: "no market source",
        notes: [
          "Individual bonds (CUSIPs) have no daily price history in FMP or Schwab's price history.",
          "Treasuries could be approximated from FRED yield curves, but that is a model, not a market price.",
        ],
      };
    }

    const fmp: AdjustedCloses = await fetchAdjustedCloses(a.symbol, from, today);
    const dates = new Set(fmp.closes.map((c) => c.date));
    const first = fmp.closes[0]?.date ?? null;
    const last = fmp.closes.at(-1)?.date ?? null;

    const notes: string[] = [];
    let missingInRange: string[] = [];
    if (fmp.closes.length && calendar.length) {
      // Only within the symbol's own span: before its first day it may not
      // have existed yet, which is reported separately, not as a gap.
      missingInRange = calendar.filter((d) => d >= first! && d <= last! && !dates.has(d));
      if (first! > calendar[0]) notes.push(`History starts ${first}, after the window start ${calendar[0]}.`);
      if (last! < calendar.at(-1)!) notes.push(`History ends ${last}; the last trading day is ${calendar.at(-1)}.`);
    }

    // FMP has nothing: what Schwab can offer instead, and why it is not enough.
    let schwab: { days: number; first: string | null; last: string | null } | null = null;
    if (!fmp.closes.length && token) {
      try {
        const hist = await getPriceHistory(token, a.symbol, "year", 1, "daily", 1);
        const candleDates = (hist.candles ?? [])
          .map((c) => new Date(Number(c.datetime)).toISOString().slice(0, 10))
          .filter((d) => d >= from);
        schwab = { days: candleDates.length, first: candleDates[0] ?? null, last: candleDates.at(-1) ?? null };
      } catch {
        schwab = { days: 0, first: null, last: null };
      }
    }

    let verdict: string;
    if (fmp.closes.length) {
      verdict = missingInRange.length ? "covered, with gaps" : "covered";
    } else if (schwab?.days) {
      verdict = "price only";
      notes.push(
        "FMP has no dividend-adjusted history; Schwab's price history excludes distributions, so it is not a total return.",
      );
    } else {
      verdict = "no market source";
    }
    if (!fmp.closes.length) {
      notes.push(
        fmp.status === 402
          ? "FMP answered 402: this symbol is outside the current FMP plan."
          : fmp.status == null
            ? "The FMP request failed."
            : `FMP answered ${fmp.status} with no usable rows.`,
      );
    }

    return {
      ...base,
      verdict,
      fmp: {
        status: fmp.status,
        days: fmp.closes.length,
        first,
        last,
        missingTradingDays: missingInRange.length,
        missingDates: missingInRange.slice(0, 30),
        fields: fmp.fields,
      },
      ...(schwab ? { schwabPriceOnly: schwab } : {}),
      notes,
    };
  }

  const summary: Record<string, number> = {};
  for (const r of results as { verdict: string }[]) summary[r.verdict] = (summary[r.verdict] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    window: { from, to: today },
    calendar: {
      symbol: CALENDAR_SYMBOL,
      tradingDays: calendar.length,
      fmpStatus: calendarSeries.status,
      fmpFields: calendarSeries.fields,
      ...(fmpUsable ? {} : { problem: "FMP returned nothing for SPY, so FMP is not usable as the price source until that is fixed." }),
    },
    assetCount: results.length,
    summary,
    assets: results,
  });
}
