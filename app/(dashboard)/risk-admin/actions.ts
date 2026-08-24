"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateThreshold, type ThresholdField } from "@/lib/risk-thresholds";

/**
 * Threshold edits. Per the spec: only the risk manager (admin/developer)
 * touches these, and every change is logged with old value, new value, who,
 * and when — updateThreshold() writes that audit row in the same call.
 *
 * Red is editable here for now. The framework doc's intent is for red lines
 * to become committee-ratified and immovable without a vote once that
 * process exists — this UI is the seam where that gate gets added later.
 */
export async function updateThresholdAction(formData: FormData) {
  const profile = await requireRole(["admin", "developer"]);

  const limitId = String(formData.get("limitId") ?? "");
  const field = String(formData.get("field") ?? "") as ThresholdField;
  const raw = String(formData.get("value") ?? "");
  if (!limitId || !field || !raw) return;

  let value: number | [number, number];
  if (field === "rangeGreen" || field === "rangeYellow") {
    const [low, high] = raw.split(",").map(Number);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return;
    value = [low, high];
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    value = n;
  }

  await updateThreshold({ limitId, field, value, changedBy: profile.id });
  revalidatePath("/risk-admin");
}

export async function resolveBreachAction(formData: FormData) {
  const profile = await requireRole(["admin", "developer", "pm"]);
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("risk_breach_log")
    .update({ resolved_at: new Date().toISOString(), note: note || null, decided_by: profile.id })
    .eq("id", id);

  revalidatePath("/risk-admin");
}
