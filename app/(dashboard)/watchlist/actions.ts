"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function addWatchlistItemAction(formData: FormData) {
  const profile = await requireProfile();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const analystTarget = String(formData.get("analystTarget") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const pitchId = String(formData.get("pitchId") ?? "").trim() || null;
  if (!ticker) return;

  const supabase = await createClient();
  const elevated = profile.role === "pm" || profile.role === "admin" || profile.role === "developer";

  const { error: insErr } = await supabase.from("watchlist_items").insert({
    ticker,
    added_by: profile.id,
    analyst_target: analystTarget,
    notes,
    pitch_id: pitchId,
  });

  const dup =
    !!insErr &&
    (insErr.code === "23505" ||
      insErr.message?.toLowerCase().includes("duplicate") ||
      insErr.message?.toLowerCase().includes("unique"));

  if (insErr && !dup) return;

  if (dup) {
    const { data: existing } = await supabase
      .from("watchlist_items")
      .select("id, added_by")
      .eq("ticker", ticker)
      .maybeSingle();
    if (existing && (existing.added_by === profile.id || elevated)) {
      await supabase
        .from("watchlist_items")
        .update({ analyst_target: analystTarget, notes, pitch_id: pitchId })
        .eq("ticker", ticker);
    }
  }

  revalidatePath("/watchlist");
}

export async function removeWatchlistItemAction(formData: FormData) {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: row } = await supabase.from("watchlist_items").select("added_by").eq("id", id).maybeSingle();
  if (!row) return;
  const elevated = profile.role === "pm" || profile.role === "admin" || profile.role === "developer";
  if (row.added_by !== profile.id && !elevated) return;

  await supabase.from("watchlist_items").delete().eq("id", id);
  revalidatePath("/watchlist");
}
