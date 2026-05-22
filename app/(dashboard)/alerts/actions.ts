"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createAlertAction(formData: FormData) {
  const profile = await requireProfile();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const companyName = String(formData.get("companyName") ?? "").trim() || null;
  const sector = String(formData.get("sector") ?? "").trim();
  const buyLimit = formData.get("buyLimit") ? Number(formData.get("buyLimit")) : null;
  const sellLimit = formData.get("sellLimit") ? Number(formData.get("sellLimit")) : null;

  if (!ticker || !sector) return;

  const supabase = await createClient();
  await supabase.from("stock_alerts").insert({
    ticker,
    company_name: companyName,
    sector,
    buy_limit: buyLimit,
    sell_limit: sellLimit,
    created_by: profile.id,
    status: "active",
  });

  revalidatePath("/alerts");
}

export async function dismissAlertAction(formData: FormData) {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("stock_alerts")
    .update({ status: "active", triggered_at: null })
    .eq("id", id)
    .eq("created_by", profile.id);

  revalidatePath("/alerts");
}

export async function deleteAlertAction(formData: FormData) {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("stock_alerts").delete().eq("id", id).eq("created_by", profile.id);

  revalidatePath("/alerts");
}
