"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveProfileNameAction(formData: FormData) {
  const profile = await requireProfile();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();

  if (!firstName || !lastName) {
    return;
  }

  const supabase = await createClient();
  const fullName = `${firstName} ${lastName}`.trim();

  await supabase
    .from("user_profiles")
    .update({ first_name: firstName, last_name: lastName, full_name: fullName })
    .eq("id", profile.id);

  await supabase.auth.updateUser({
    data: { first_name: firstName, last_name: lastName, full_name: fullName },
  });

  updateTag("profiles");
  revalidatePath("/home");
  redirect("/home");
}
