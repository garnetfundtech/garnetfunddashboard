import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountPositions } from "@/lib/schwab";

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
      .eq("id", "master")
      .single();

    if (!tokenRow?.access_token) {
      throw new Error("Missing Schwab token. Complete OAuth first.");
    }

    const accounts = await getAccountPositions(tokenRow.access_token);

    await admin.from("sync_logs").insert({
      sync_job_id: job?.id ?? null,
      level: "info",
      message: "Fetched account positions payload",
      payload: { accountCount: Array.isArray(accounts) ? accounts.length : 1 },
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
