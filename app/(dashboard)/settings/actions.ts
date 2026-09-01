"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireApprovedProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Lets a member fix their own display name. Role and class year stay admin-only. */
export async function updateOwnNameAction(formData: FormData) {
  const profile = await requireApprovedProfile();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const fullName = `${firstName} ${lastName}`;

  // RLS reserves profile writes for developers/admins, so an analyst editing
  // their own name has to go through the service role — scoped to their own id.
  await createAdminClient()
    .from("user_profiles")
    .update({ first_name: firstName, last_name: lastName, full_name: fullName })
    .eq("id", profile.id);

  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { first_name: firstName, last_name: lastName, full_name: fullName },
  });

  // The sidebar renders the cached profile, so without this the new name sits
  // invisible behind the 120s window in lib/auth.ts.
  updateTag("profiles");
  revalidatePath("/settings");
  revalidatePath("/home");
}
