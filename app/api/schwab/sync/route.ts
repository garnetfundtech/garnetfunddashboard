import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountPositions } from "@/lib/schwab";

type SchwabPosition = {
  marketValue?: number;
  longQuantity?: number;
  shortQuantity?: number;
  instrument?: {
    symbol?: string;
    description?: string;
    assetType?: string;
  };
};

type SchwabBalances = {
  liquidationValue?: number;
  cashAvailableForTrading?: number;
  totalCash?: number;
  longMarketValue?: number;
  mutualFundValue?: number;
};

type SchwabAccount = {
  securitiesAccount?: {
    accountNumber?: string;
    type?: string;
    positions?: SchwabPosition[];
    currentBalances?: SchwabBalances;
  };
  aggregatedBalance?: {
    currentLiquidationValue?: number;
    liquidationValue?: number;
  };
};

function normalizeSchwabAccounts(payload: unknown): SchwabAccount[] {
  if (Array.isArray(payload)) return payload as SchwabAccount[];
  if (payload && typeof payload === "object") return [payload as SchwabAccount];
  return [];
}

export async function POST() {
  if (process.env.ENABLE_SCHWAB_SYNC !== "true") {
    return NextResponse.json(
      { ok: false, message: "Schwab integration is disabled by feature flag." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const startedAt = new Date().toISOString();

  const { data: job } = await admin
    .from("sync_jobs")
    .insert({ provider: "schwab", status: "running", started_at: startedAt })
    .select("id")
    .single();

  try {
    const { data: tokenRow } = await admin
      .from("schwab_tokens")
      .select("*")
      .eq("id", "trader")
      .single();

    if (!tokenRow?.access_token) {
      throw new Error("Missing Schwab token. Complete OAuth first.");
    }

    const accounts = await getAccountPositions(tokenRow.access_token);
    const capturedAt = new Date().toISOString();
    const normalized = normalizeSchwabAccounts(accounts);
    const positions: SchwabPosition[] = normalized.flatMap(
      (acct) => acct?.securitiesAccount?.positions ?? [],
    );

    const totalMarketValue = positions.reduce((sum, p) => sum + Number(p.marketValue ?? 0), 0);

    const accountBalances = normalized.map((acct) => ({
      accountNumber: acct?.securitiesAccount?.accountNumber ?? "unknown",
      accountType: acct?.securitiesAccount?.type ?? "unknown",
      liquidationValue: Number(
        acct?.aggregatedBalance?.currentLiquidationValue ??
        acct?.securitiesAccount?.currentBalances?.liquidationValue ?? 0
      ),
      cashAvailableForTrading: Number(acct?.securitiesAccount?.currentBalances?.cashAvailableForTrading ?? 0),
      longMarketValue: Number(acct?.securitiesAccount?.currentBalances?.longMarketValue ?? 0),
      mutualFundValue: Number(acct?.securitiesAccount?.currentBalances?.mutualFundValue ?? 0),
    }));

    const rows = positions
      .map((p) => {
        const tickerRaw = p.instrument?.symbol?.trim();
        const ticker = tickerRaw && tickerRaw.length > 0 ? tickerRaw : null;
        const marketValue = Number(p.marketValue ?? 0);
        const weight = totalMarketValue > 0 ? marketValue / totalMarketValue : 0;

        // Schwab Trader positions payload doesn't reliably include sector. Keep a stable placeholder.
        return ticker
          ? {
              captured_at: capturedAt,
              ticker,
              company_name: p.instrument?.description?.trim() || ticker,
              sector: "Unknown",
              market_value: marketValue,
              weight,
            }
          : null;
      })
      .filter(Boolean) as {
      captured_at: string;
      ticker: string;
      company_name: string;
      sector: string;
      market_value: number;
      weight: number;
    }[];

    if (rows.length > 0) {
      const { error: insertError } = await admin.from("holdings_snapshots").insert(rows);
      if (insertError) {
        throw new Error(`Failed inserting holdings snapshot: ${insertError.message}`);
      }
    }

    await admin.from("sync_logs").insert({
      sync_job_id: job?.id ?? null,
      level: "info",
      message: "Fetched account positions payload",
      payload: {
        accountCount: normalized.length,
        positionCount: positions.length,
        insertedHoldingsRows: rows.length,
        totalMarketValue,
        capturedAt,
        accountBalances,
      },
    });

    await admin
      .from("sync_jobs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job?.id);

    return NextResponse.json({ ok: true, mode: "feature-flagged", synced: true });
  } catch (error) {
    await admin.from("sync_logs").insert({
      sync_job_id: job?.id ?? null,
      level: "error",
      message: error instanceof Error ? error.message : "Unknown Schwab sync error",
      payload: {},
    });
    await admin
      .from("sync_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", job?.id);

    return NextResponse.json(
      {
        ok: false,
        mode: "feature-flagged",
        message: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 },
    );
  }
}
