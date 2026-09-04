"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedProfile } from "@/lib/auth";
import { isRiskManager } from "@/lib/nav-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeApproval, upsertApproval } from "@/lib/risk-approvals";
import { acknowledgeEpisode } from "@/lib/risk-episodes";
import { sendAllocationEscalation } from "@/lib/notify";
import type { Team } from "@/lib/risk-engine";

/**
 * Spec §6 Access: "Risk Manager: full access and edit rights on limits and
 * position entry. President and PMs: read access to both tabs." Every write
 * on this page goes through this gate, so a PM who can see the board still
 * cannot change what it measures.
 */
async function requireRiskManager() {
  const profile = await requireApprovedProfile();
  if (!isRiskManager(profile.role)) {
    throw new Error("Only the Risk Manager can edit position approvals and alert records.");
  }
  return profile;
}

const num = (v: FormDataEntryValue | null): number | null => {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const text = (v: FormDataEntryValue | null): string | null => {
  const raw = String(v ?? "").trim();
  return raw || null;
};

const bool = (v: FormDataEntryValue | null): boolean => v === "on" || v === "true" || v === "1";

/** §3.4 — the Risk Manager entry form. */
export async function saveApprovalAction(formData: FormData) {
  const profile = await requireRiskManager();

  // The same form carries the "close this approval" submit, so that branch is
  // handled here rather than in a second action with a duplicate gate.
  if (formData.get("close") === "1") {
    const admin = createAdminClient();
    const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
    const { data } = await admin
      .from("position_approvals")
      .select("id")
      .eq("symbol", symbol)
      .is("closed_at", null)
      .maybeSingle();
    if (data?.id) await closeApproval(data.id as string);
    revalidatePath("/risk");
    return;
  }

  const teamRaw = text(formData.get("team"));
  await upsertApproval(
    {
      symbol: String(formData.get("symbol") ?? ""),
      team: teamRaw === "equities" || teamRaw === "alternatives" ? (teamRaw as Team) : null,
      sector: text(formData.get("sector")),
      approvedSizePct: num(formData.get("approvedSizePct")),
      approvalDate: text(formData.get("approvalDate")),
      monitoringConditions: text(formData.get("monitoringConditions")),
      stopOrderConfirmed: bool(formData.get("stopOrderConfirmed")),
      stopOrderRef: text(formData.get("stopOrderRef")),
      definedRiskMaxLoss: num(formData.get("definedRiskMaxLoss")),
      priceTarget: num(formData.get("priceTarget")),
      analystId: text(formData.get("analystId")),
      thesisDriven: bool(formData.get("thesisDriven")),
      shortExpiryApproved: bool(formData.get("shortExpiryApproved")),
      gainUnrelatedToThesis: bool(formData.get("gainUnrelatedToThesis")),
      notes: text(formData.get("notes")),
    },
    profile.id,
  );

  revalidatePath("/risk");
}

/** §4.3 — the acknowledge button and its free-text resolution note. */
export async function acknowledgeEpisodeAction(formData: FormData) {
  const profile = await requireRiskManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await acknowledgeEpisode(id, profile.id, String(formData.get("note") ?? "").trim());
  revalidatePath("/risk");
}

/**
 * IPS VIII.b: an allocation breach goes to the Risk Manager first, and only
 * once the Risk Manager confirms it do the President and Faculty Advisor hear
 * about it. That confirmation is this action — deliberately a human step, not
 * an automatic second email.
 */
export async function confirmAllocationBreachAction(formData: FormData) {
  const profile = await requireRiskManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const note = String(formData.get("note") ?? "").trim();

  const admin = createAdminClient();
  const { data } = await admin
    .from("risk_alert_episodes")
    .select("monitor_label, value_at_trigger, threshold")
    .eq("id", id)
    .maybeSingle();

  await acknowledgeEpisode(id, profile.id, note);

  if (data) {
    await sendAllocationEscalation({
      label: (data.monitor_label as string) ?? "Allocation",
      value: data.value_at_trigger != null ? `${Number(data.value_at_trigger).toFixed(2)}%` : "—",
      limitText: (data.threshold as string) ?? "—",
      note,
      confirmedBy: profile.full_name ?? profile.email,
    });
  }

  revalidatePath("/risk");
}

/** §5.3 — the Senior Analyst post-mortem checkbox required by IPS V.a. */
export async function markPostMortemAction(formData: FormData) {
  const profile = await requireApprovedProfile();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("stop_loss_events")
    .update({
      post_mortem_delivered: true,
      post_mortem_by: profile.id,
      post_mortem_at: new Date().toISOString(),
      post_mortem_note: String(formData.get("note") ?? "").trim() || null,
    })
    .eq("id", id);

  revalidatePath("/risk");
}
