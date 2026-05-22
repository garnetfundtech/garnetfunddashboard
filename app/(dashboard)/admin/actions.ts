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
  const roleRaw = String(formData.get("role") ?? "analyst");
  const allowed: UserRole[] = ["analyst", "pm", "admin", "developer"];
  const role = (allowed.includes(roleRaw as UserRole) ? roleRaw : "analyst") as UserRole;

  if (!email || !email.includes("@") || !firstName || !lastName) return;

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
  const roleRaw = String(formData.get("role") ?? "analyst");
  const allowed: UserRole[] = ["analyst", "pm", "admin", "developer"];
  const role = (allowed.includes(roleRaw as UserRole) ? roleRaw : "analyst") as UserRole;
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

export async function assignSectorAction(formData: FormData) {
  await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  const sector = String(formData.get("sector") ?? "").trim() || null;
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("user_profiles").update({ coverage_sector: sector }).eq("id", id);

  revalidatePath("/admin");
}
