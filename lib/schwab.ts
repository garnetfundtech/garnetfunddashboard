const SCHWAB_AUTH_BASE = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_BASE = "https://api.schwabapi.com/v1/oauth/token";
const SCHWAB_TRADER_BASE = "https://api.schwabapi.com/trader/v1";
const SCHWAB_MARKET_BASE = "https://api.schwabapi.com/marketdata/v1";

export type SchwabConnection = "trader" | "market";

function getSchwabEnv(connection: SchwabConnection) {
  if (connection === "market") {
    const clientId = process.env.SCHWAB_MARKET_CLIENT_ID ?? process.env.SCHWAB_CLIENT_ID ?? "";
    const clientSecret =
      process.env.SCHWAB_MARKET_CLIENT_SECRET ?? process.env.SCHWAB_CLIENT_SECRET ?? "";
    const redirectUri =
      process.env.SCHWAB_MARKET_REDIRECT_URI ??
      process.env.SCHWAB_MARKET_REDIRECT_URL ??
      process.env.SCHWAB_REDIRECT_URI ??
      process.env.SCHWAB_REDIRECT_URL ??
      "https://127.0.0.1";
    return { clientId, clientSecret, redirectUri };
  }

  const clientId = process.env.SCHWAB_CLIENT_ID ?? "";
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET ?? "";
  const redirectUri =
    process.env.SCHWAB_TRADER_REDIRECT_URI ??
    process.env.SCHWAB_TRADER_REDIRECT_URL ??
    process.env.SCHWAB_REDIRECT_URI ??
    process.env.SCHWAB_REDIRECT_URL ??
    "https://127.0.0.1";
  return { clientId, clientSecret, redirectUri };
}

export function getSchwabAuthUrl(state: string, connection: SchwabConnection = "trader") {
  const { clientId, redirectUri } = getSchwabEnv(connection);
  if (!clientId) {
    throw new Error(connection === "market" ? "Missing SCHWAB_MARKET_CLIENT_ID" : "Missing SCHWAB_CLIENT_ID");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });

  return `${SCHWAB_AUTH_BASE}?${params.toString()}`;
}

function getBasicAuthHeader(connection: SchwabConnection) {
  const { clientId, clientSecret } = getSchwabEnv(connection);
  const raw = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${raw}`;
}

export async function exchangeCodeForTokens(code: string, connection: SchwabConnection = "trader") {
  const { redirectUri } = getSchwabEnv(connection);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(SCHWAB_TOKEN_BASE, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(connection),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function refreshAccessToken(
  refreshToken: string,
  connection: SchwabConnection = "trader",
) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(SCHWAB_TOKEN_BASE, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(connection),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Preserve status + payload so callers can distinguish transient vs invalid_grant.
    throw new Error(`Token refresh failed: ${response.status} ${text}`.trim());
  }

  return response.json();
}

export async function getAccountPositions(accessToken: string) {
  const response = await fetch(`${SCHWAB_TRADER_BASE}/accounts?fields=positions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Accounts request failed: ${response.status}`);
  return response.json();
}

export async function getAccountNumbers(accessToken: string) {
  // The account list / hash never changes — cache a full day so orders,
  // transactions, and turnover skip this round-trip entirely.
  const response = await fetch(`${SCHWAB_TRADER_BASE}/accounts/accountNumbers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error(`Account numbers request failed: ${response.status}`);
  return response.json() as Promise<{ accountNumber: string; hashValue: string }[]>;
}

/**
 * Schwab silently returns an empty array (HTTP 200, no error) when the
 * requested window is longer than a year, so anything wider has to be walked
 * in sub-year chunks rather than asked for in one call.
 */
const SCHWAB_ORDER_WINDOW_DAYS = 350;

export async function getAccountOrders(accessToken: string, accountHash: string, days = 30) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const stamp = (ms: number) => new Date(ms).toISOString().split(".")[0] + "Z";

  const all: unknown[] = [];
  for (let offset = 0; offset < days; offset += SCHWAB_ORDER_WINDOW_DAYS) {
    const chunkDays = Math.min(SCHWAB_ORDER_WINDOW_DAYS, days - offset);
    const params = new URLSearchParams({
      fromEnteredTime: stamp(now - (offset + chunkDays) * dayMs),
      toEnteredTime: stamp(now - offset * dayMs),
    });
    const response = await fetch(
      `${SCHWAB_TRADER_BASE}/accounts/${accountHash}/orders?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Orders request failed: ${response.status}`);
    const page = await response.json();
    if (Array.isArray(page)) all.push(...page);
  }
  return all;
}

// ── Market Data API ──────────────────────────────────────────────────────────

export async function getQuotes(accessToken: string, symbols: string[]) {
  const params = new URLSearchParams({ symbols: symbols.join(","), fields: "quote,fundamental" });
  const response = await fetch(`${SCHWAB_MARKET_BASE}/quotes?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 30 },
  });
  if (!response.ok) throw new Error(`Quotes request failed: ${response.status}`);
  return response.json() as Promise<Record<string, SchwabQuoteResponse>>;
}

export type SchwabQuoteResponse = {
  assetMainType?: string;
  symbol?: string;
  description?: string;
  quote?: {
    lastPrice?: number;
    openPrice?: number;
    highPrice?: number;
    lowPrice?: number;
    closePrice?: number;
    netChange?: number;
    netPercentChange?: number;
    totalVolume?: number;
    "52WeekHigh"?: number;
    "52WeekLow"?: number;
    bidPrice?: number;
    askPrice?: number;
    mark?: number;
  };
  fundamental?: {
    peRatio?: number;
    eps?: number;
    divYield?: number;
    marketCap?: number;
  };
  /** Option symbols only. Schwab returns per-contract greeks in the quote
   *  block and the contract terms in `reference`; both are absent for every
   *  other asset type. */
  reference?: {
    contractType?: "P" | "C";
    expirationDay?: number;
    expirationMonth?: number;
    expirationYear?: number;
    strikePrice?: number;
    underlying?: string;
    multiplier?: number;
  };
};

export type SchwabOptionGreeks = {
  delta: number | null;
  theta: number | null;
  vega: number | null;
  expiry: string | null;
  strike: number | null;
  putCall: "PUT" | "CALL" | null;
  multiplier: number | null;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Per-contract greeks for a set of option symbols, from the quotes endpoint.
 *
 * A symbol whose greeks the feed omits is returned with nulls rather than
 * dropped: the risk dashboard has to be able to say "this contract's theta is
 * unavailable" instead of quietly summing the ones it does have and calling
 * that the book's net theta.
 */
export async function getOptionGreeks(
  accessToken: string,
  optionSymbols: string[],
): Promise<Record<string, SchwabOptionGreeks>> {
  if (!optionSymbols.length) return {};
  const params = new URLSearchParams({ symbols: optionSymbols.join(","), fields: "quote,reference" });
  const response = await fetch(`${SCHWAB_MARKET_BASE}/quotes?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Option quotes request failed: ${response.status}`);
  const body = (await response.json()) as Record<string, Record<string, unknown>>;

  const out: Record<string, SchwabOptionGreeks> = {};
  for (const [symbol, row] of Object.entries(body)) {
    const quote = (row.quote ?? {}) as Record<string, unknown>;
    const ref = (row.reference ?? {}) as Record<string, unknown>;
    const y = num(ref.expirationYear);
    const m = num(ref.expirationMonth);
    const d = num(ref.expirationDay);
    const pad = (n: number) => String(n).padStart(2, "0");
    out[symbol] = {
      delta: num(quote.delta),
      theta: num(quote.theta),
      vega: num(quote.vega),
      expiry: y != null && m != null && d != null ? `${y}-${pad(m)}-${pad(d)}` : null,
      strike: num(ref.strikePrice),
      putCall: ref.contractType === "P" ? "PUT" : ref.contractType === "C" ? "CALL" : null,
      multiplier: num(ref.multiplier),
    };
  }
  return out;
}

export type PriceCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  datetime: number;
};

export async function getPriceHistory(
  accessToken: string,
  symbol: string,
  periodType: "day" | "month" | "year" | "ytd" = "year",
  period = 1,
  frequencyType: "minute" | "daily" | "weekly" | "monthly" = "daily",
  frequency = 1,
) {
  const params = new URLSearchParams({
    symbol,
    periodType,
    period: String(period),
    frequencyType,
    frequency: String(frequency),
    needPreviousClose: "true",
  });
  const response = await fetch(`${SCHWAB_MARKET_BASE}/pricehistory?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 180 },
  });
  if (!response.ok) throw new Error(`Price history request failed: ${response.status}`);
  return response.json() as Promise<{ symbol: string; empty: boolean; candles: PriceCandle[] }>;
}

export type SchwabMover = {
  symbol?: string;
  description?: string;
  lastPrice?: number;
  /** Raw Schwab field — dollar change */
  netChange?: number;
  /** Raw Schwab field — decimal ratio (0.1682 = 16.82%), multiply × 100 for display */
  netPercentChange?: number;
  totalVolume?: number;
  volume?: number;
  trades?: number;
  marketShare?: number;
};

export async function getMarketMovers(
  accessToken: string,
  index: "$SPX" | "$DJI" | "$COMPX" | "NASDAQ" | "NYSE" = "$SPX",
  sort: "PERCENT_CHANGE_UP" | "PERCENT_CHANGE_DOWN" | "VOLUME" = "PERCENT_CHANGE_UP",
) {
  const params = new URLSearchParams({ sort, frequency: "0" });
  const encodedIndex = encodeURIComponent(index);
  const response = await fetch(`${SCHWAB_MARKET_BASE}/movers/${encodedIndex}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 120 },
  });
  if (!response.ok) throw new Error(`Movers request failed: ${response.status}`);
  const data = await response.json();
  return (Array.isArray(data) ? data : data?.screeners ?? []) as SchwabMover[];
}

export async function getMarketHours(accessToken: string) {
  const today = new Date().toISOString().split("T")[0];
  const params = new URLSearchParams({ markets: "equity,option", date: today });
  const response = await fetch(`${SCHWAB_MARKET_BASE}/markets?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 600 },
  });
  if (!response.ok) throw new Error(`Market hours request failed: ${response.status}`);
  return response.json() as Promise<Record<string, Record<string, {
    isOpen: boolean;
    sessionHours?: {
      regularMarket?: { start: string; end: string }[];
      preMarket?: { start: string; end: string }[];
      postMarket?: { start: string; end: string }[];
    };
  }>>>;
}
