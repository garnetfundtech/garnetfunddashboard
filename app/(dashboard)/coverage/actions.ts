"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit";
import { isCoverageTeam, toCoverageTeam } from "@/lib/sectors";
import type { UserRole } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Roles that may add or remove a ticker on someone else's behalf. */
const MANAGE_ANY_ROLES: UserRole[] = ["pm", "admin", "developer"];

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/;

/**
 * Adds a ticker to the coverage map, owned by whoever added it.
 *
 * The team defaults to the adder's own coverage team; an explicit team is
 * accepted so someone unassigned (or covering a name that sits with another
 * group) can still file it correctly. Nothing here is sensitive — the coverage
 * map is fund-wide and every row shows who added it.
 */
export async function addCoverageTickerAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();

  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const requestedSector = String(formData.get("sector") ?? "").trim();

  if (!ticker) return { ok: false, error: "A ticker is required." };
  if (!TICKER_RE.test(ticker)) {
    return {
      ok: false,
      error: "Tickers are 1–12 characters, letters and numbers only.",
    };
  }
  if (companyName.length > 120) {
    return { ok: false, error: "Company name must be 120 characters or fewer." };
  }

  const sector =
    (isCoverageTeam(requestedSector) ? requestedSector : null) ??
    toCoverageTeam(profile.coverage_sector) ??
    null;

  if (!sector) {
    return {
      ok: false,
      error: `Pick a team for ${ticker} — you aren't assigned to one yet.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("coverage_tickers").insert({
    ticker,
    company_name: companyName || null,
    sector,
    analyst_id: profile.id,
  });

  if (error) {
    // 23505 is unique_violation — coverage_tickers_analyst_ticker_key.
    if (error.code === "23505") {
      return { ok: false, error: `You already cover ${ticker}.` };
    }
    // 42P01 is undefined_table — migration 0025 hasn't been applied yet.
    if (error.code === "42P01") {
      return {
        ok: false,
        error: "Coverage tickers aren't set up yet — ask a developer to run migration 0025.",
      };
    }
    return { ok: false, error: "Could not add that ticker." };
  }

  await logAuditEvent({
    action: "coverage_ticker.create",
    entity_type: "coverage_ticker",
    metadata: { ticker, sector, companyName: companyName || null },
  });

  revalidatePath("/coverage");
  return { ok: true };
}

/** Removes a ticker. Yours to remove, or anyone's for pm/admin/developer. */
export async function deleteCoverageTickerAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing ticker." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("coverage_tickers")
    .select("id,ticker,analyst_id")
    .eq("id", id)
    .maybeSingle();

  if (!row) return { ok: false, error: "That ticker is already gone." };

  const target = row as { id: string; ticker: string; analyst_id: string };
  const mayManage =
    MANAGE_ANY_ROLES.includes(profile.role) || target.analyst_id === profile.id;
  if (!mayManage) {
    return { ok: false, error: "You can only remove tickers you added." };
  }

  const { error } = await admin.from("coverage_tickers").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not remove that ticker." };

  await logAuditEvent({
    action: "coverage_ticker.delete",
    entity_type: "coverage_ticker",
    entity_id: id,
    metadata: { ticker: target.ticker },
  });

  revalidatePath("/coverage");
  return { ok: true };
}
