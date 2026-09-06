"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedProfile } from "@/lib/auth";
import { isRiskManager } from "@/lib/nav-access";
import { updateRiskConfig, type ConfigKey } from "@/lib/risk-config";
import { backfillNavFromSnapshots, importNavLog } from "@/lib/risk-nav";

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

/**
 * §8: the Risk Manager's pre-go-live NAV log, imported on day one. Volatility,
 * Sharpe and VaR all read this series and it cannot be reconstructed after the
 * fact, so this is the only way history before go-live ever exists.
 */
export async function importNavLogAction(_prev: unknown, formData: FormData) {
  await requireRiskManager();
  const text = String(formData.get("log") ?? "");
  if (!text.trim()) return { ok: false, message: "Paste at least one row." };

  try {
    const { imported, skipped } = await importNavLog(text);
    revalidatePath("/risk-admin");
    revalidatePath("/risk");
    return {
      ok: imported > 0,
      message:
        `${imported} day${imported === 1 ? "" : "s"} imported.` +
        (skipped.length ? ` ${skipped.length} row(s) skipped: ${skipped.slice(0, 3).join("; ")}` : ""),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Import failed." };
  }
}

/**
 * Pulls NAV forward from the stored daily snapshots into the NAV series. Every
 * figure was captured on its own day, so this recovers history rather than
 * inventing it — but any day that carried a donation still needs importing
 * with its external flow, since a snapshot cannot tell a gift from a gain.
 */
export async function backfillNavAction(_prev: unknown, _formData: FormData) {
  await requireRiskManager();
  try {
    const { added, skipped, flagged } = await backfillNavFromSnapshots();
    revalidatePath("/risk-admin");
    revalidatePath("/risk");
    return {
      ok: added > 0,
      message: added
        ? `${added} day${added === 1 ? "" : "s"} recovered.` +
          (skipped ? ` ${skipped} already present.` : "") +
          (flagged.length
            ? ` ${flagged.length} day(s) moved too far to be performance and were recorded as flows — ` +
              `${flagged.map((f) => `${f.date} (${f.movePct.toFixed(0)}%)`).join(", ")}. ` +
              `Re-import those dates with the actual contribution amount.`
            : "")
        : "Nothing to recover — every snapshot day is already in the series.",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Backfill failed." };
  }
}
