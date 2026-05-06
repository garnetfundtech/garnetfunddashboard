"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PitchStage } from "@/lib/types";

const TERMINAL: PitchStage[] = ["position", "rejected"];

function canSetTerminal(role: string) {
  return role === "pm" || role === "admin" || role === "developer";
}

export async function createPitchAction(formData: FormData) {
  const profile = await requireProfile();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const thesis = String(formData.get("thesis") ?? "").trim();
  const researchRaw = String(formData.get("researchId") ?? "").trim();
  const research_id = researchRaw.length ? researchRaw : null;
  if (!ticker || !thesis) return;

  const supabase = await createClient();
  await supabase.from("pitches").insert({
    ticker,
    thesis,
    analyst_id: profile.id,
    research_id,
    stage: "idea",
  });

  revalidatePath("/pipeline");
}

export async function updatePitchStageAction(formData: FormData) {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "") as PitchStage;
  if (!id || !stage) return;

  if (TERMINAL.includes(stage) && !canSetTerminal(profile.role)) {
    return;
  }

  const supabase = await createClient();
  const { data: row } = await supabase.from("pitches").select("analyst_id, stage").eq("id", id).maybeSingle();
  if (!row) return;

  const isOwner = row.analyst_id === profile.id;
  const isElevated = canSetTerminal(profile.role);
  if (!isOwner && !isElevated) return;

  if (TERMINAL.includes(stage) && !isElevated) return;

  const updates: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
  if (stage === "position") {
    const { data: pitch } = await supabase.from("pitches").select("ticker").eq("id", id).maybeSingle();
    if (pitch?.ticker) updates.position_symbol = String(pitch.ticker).toUpperCase();
  }

  await supabase.from("pitches").update(updates).eq("id", id);
  revalidatePath("/pipeline");
}

export async function updatePitchAction(formData: FormData) {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const thesis = String(formData.get("thesis") ?? "").trim();
  const researchRaw = String(formData.get("researchId") ?? "").trim();
  const researchId = researchRaw.length ? researchRaw : null;
  if (!ticker || !thesis) return;

  const supabase = await createClient();
  const { data: row } = await supabase.from("pitches").select("analyst_id").eq("id", id).maybeSingle();
  if (!row) return;

  const isOwner = row.analyst_id === profile.id;
  const isElevated = canSetTerminal(profile.role);
  if (!isOwner && !isElevated) return;

  await supabase
    .from("pitches")
    .update({
      ticker,
      thesis,
      research_id: researchId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/pipeline");
}

export async function deletePitchAction(formData: FormData) {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  const { data: row } = await supabase.from("pitches").select("analyst_id").eq("id", id).maybeSingle();
  if (!row) return;

  const isOwner = row.analyst_id === profile.id;
  const isElevated = canSetTerminal(profile.role);
  if (!isOwner && !isElevated) return;

  await supabase.from("pitches").delete().eq("id", id);
  revalidatePath("/pipeline");
}

export async function linkPitchResearchAction(formData: FormData) {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const researchId = String(formData.get("researchId") ?? "").trim() || null;
  if (!id) return;

  const supabase = await createClient();
  const { data: row } = await supabase.from("pitches").select("analyst_id").eq("id", id).maybeSingle();
  if (!row) return;
  if (row.analyst_id !== profile.id && !canSetTerminal(profile.role)) return;

  await supabase
    .from("pitches")
    .update({ research_id: researchId, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/pipeline");
}
