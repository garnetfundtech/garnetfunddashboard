"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";
import { logAuditEvent } from "@/lib/audit";

export async function inviteUserAction(formData: FormData) {
  await requireRole(["developer", "admin"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const role = String(formData.get("role") ?? "analyst") as UserRole;

  if (!email || !email.endsWith("email.sc.edu") || !firstName || !lastName) return;

  const admin = createAdminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`;
  const { data } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
    },
  });

  if (data.user) {
    await admin.from("user_profiles").upsert({
      id: data.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      role,
    });
  }

  await logAuditEvent({
    action: "user.invite",
    entity_type: "user_profile",
    entity_id: data.user?.id ?? null,
    metadata: { email, role, firstName, lastName },
  });

  revalidatePath("/admin");
}

export async function updateUserRoleAction(formData: FormData) {
  await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "analyst") as UserRole;
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("user_profiles").update({ role }).eq("id", id);

  await logAuditEvent({
    action: "user.role_update",
    entity_type: "user_profile",
    entity_id: id,
    metadata: { role },
  });

  revalidatePath("/admin");
}
