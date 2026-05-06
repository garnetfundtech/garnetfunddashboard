const SCHWAB_AUTH_BASE = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_BASE = "https://api.schwabapi.com/v1/oauth/token";
const SCHWAB_TRADER_BASE = "https://api.schwabapi.com/trader/v1";

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
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

export async function getAccountPositions(accessToken: string) {
  const response = await fetch(`${SCHWAB_TRADER_BASE}/accounts?fields=positions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Accounts request failed: ${response.status}`);
  }

  return response.json();
}
