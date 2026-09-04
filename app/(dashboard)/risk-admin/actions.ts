"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedProfile } from "@/lib/auth";
import { isRiskManager } from "@/lib/nav-access";
import { updateRiskConfig, type ConfigKey } from "@/lib/risk-config";

/**
 * §7: "The Risk Manager holds sole edit rights, and every change must be
 * logged with a timestamp and a reason (this feeds the Decision Log)."
 *
 * The reason is enforced in updateRiskConfig rather than here, so it holds for
 * every caller — including a future API or import script — not only this form.
 */
async function requireRiskManager() {
  const profile = await requireApprovedProfile();
  if (!isRiskManager(profile.role)) {
    throw new Error("Only the Risk Manager can change a risk limit.");
  }
  return profile;
}

export async function saveConfigAction(formData: FormData) {
  const profile = await requireRiskManager();
  const key = String(formData.get("key") ?? "") as ConfigKey;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!key || !reason) return;

  // A blank value deliberately unsets the limit — that is how a parameter goes
  // back to PENDING when the Committee withdraws a number.
  const raw = String(formData.get("value") ?? "").trim();
  const numValue = raw === "" ? null : Number(raw);
  if (numValue != null && !Number.isFinite(numValue)) return;

  await updateRiskConfig({ key, numValue, reason, changedBy: profile.id });
  revalidatePath("/risk-admin");
  revalidatePath("/risk");
}

export async function saveBlackoutAction(formData: FormData) {
  const profile = await requireRiskManager();
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  // Both dates or neither: a half-open window would silently stop detecting
  // blackout trades while still looking configured.
  if ((start && !end) || (!start && end)) return;
  if (start && end && start > end) return;

  await updateRiskConfig({
    key: "blackout",
    jsonValue: start && end ? { start, end } : null,
    reason,
    changedBy: profile.id,
  });
  revalidatePath("/risk-admin");
  revalidatePath("/risk");
}

export async function saveCoverageSectorsAction(formData: FormData) {
  const profile = await requireRiskManager();
  const reason = String(formData.get("reason") ?? "").trim();
  const sectors = String(formData.get("sectors") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!reason || !sectors.length) return;

  await updateRiskConfig({ key: "coverage_sectors", jsonValue: sectors, reason, changedBy: profile.id });
  revalidatePath("/risk-admin");
  revalidatePath("/risk");
}
