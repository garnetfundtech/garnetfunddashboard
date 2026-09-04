"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";
import { normalizeClassYear } from "@/lib/class-years";
import { logAuditEvent } from "@/lib/audit";

export type InviteResult = { ok: boolean; error?: string };

/**
 * Where a clicked invite link lands. Supabase bounces through
 * /auth/callback, which trades the one-time code for a session and then
 * forwards to /set-password so the invitee picks their own password. The
 * email itself is already bound to the account, so it is never re-entered.
 *
 * Deliberately no `?next=` — the callback already defaults there, and Supabase
 * matches this URL against the Redirect URLs allow list including any query
 * string. Keeping it bare means it matches the plain `/auth/callback` entry
 * exactly, instead of relying on the allow list carrying a wildcard.
 */
function inviteRedirectTo() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/auth/callback`;
}

/**
 * Invites one member. Exported for the admin UI and reused by
 * scripts/invite-roster.mjs' logic, which mirrors this shape over the
 * service-role client.
 */
export async function inviteUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  classYear: string | null;
}): Promise<InviteResult> {
  const admin = createAdminClient();
  const fullName = `${input.firstName} ${input.lastName}`.trim();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: inviteRedirectTo(),
    data: {
      first_name: input.firstName,
      last_name: input.lastName,
      full_name: fullName,
    },
  });

  if (error || !data?.user) {
    return { ok: false, error: error?.message ?? "Invite failed with no user returned." };
  }

  const { error: profileError } = await admin.from("user_profiles").upsert({
    id: data.user.id,
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    full_name: fullName,
    role: input.role,
    class_year: input.classYear,
  });

  if (profileError) {
    return { ok: false, error: `Invite sent but profile write failed: ${profileError.message}` };
  }

  await logAuditEvent({
    action: "user.invite",
    entity_type: "user_profile",
    entity_id: data.user.id,
    metadata: {
      email: input.email,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      classYear: input.classYear,
    },
  });

  return { ok: true };
}

export async function inviteUserAction(formData: FormData): Promise<InviteResult> {
  await requireRole(["developer", "admin"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "analyst");
  const allowed: UserRole[] = ["analyst", "faculty", "risk_manager", "pm", "admin", "developer"];
  const role = (allowed.includes(roleRaw as UserRole) ? roleRaw : "analyst") as UserRole;
  const classYear = normalizeClassYear(String(formData.get("classYear") ?? ""));

  if (!email || !email.includes("@") || !firstName || !lastName) {
    return { ok: false, error: "First name, last name, and a valid email are all required." };
  }

  const result = await inviteUser({ email, firstName, lastName, role, classYear });

  if (result.ok) {
    updateTag("profiles");
    revalidatePath("/admin");
    revalidatePath("/users");
  }

  return result;
}

export async function updateUserRoleAction(formData: FormData) {
  await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  const roleRaw = String(formData.get("role") ?? "analyst");
  const allowed: UserRole[] = ["analyst", "faculty", "risk_manager", "pm", "admin", "developer"];
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

  updateTag("profiles");
  revalidatePath("/admin");
  revalidatePath("/users");
}

export async function updateUserClassYearAction(formData: FormData) {
  await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Unrecognized input clears the field rather than storing junk on the roster.
  const classYear = normalizeClassYear(String(formData.get("classYear") ?? ""));

  const admin = createAdminClient();
  await admin.from("user_profiles").update({ class_year: classYear }).eq("id", id);

  await logAuditEvent({
    action: "user.class_year_update",
    entity_type: "user_profile",
    entity_id: id,
    metadata: { classYear },
  });

  updateTag("profiles");
  revalidatePath("/admin");
  revalidatePath("/users");
}

/**
 * Lets a pending signup into the dashboard. Role and class year come from the
 * same form so an admin can correct what someone typed at signup — faculty in
 * particular sign up as 'analyst' by default.
 */
export async function approveUserAction(formData: FormData) {
  const actor = await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const roleRaw = String(formData.get("role") ?? "analyst");
  const allowed: UserRole[] = ["analyst", "faculty", "risk_manager", "pm", "admin", "developer"];
  const role = (allowed.includes(roleRaw as UserRole) ? roleRaw : "analyst") as UserRole;
  const classYear = normalizeClassYear(String(formData.get("classYear") ?? ""));

  const admin = createAdminClient();
  await admin
    .from("user_profiles")
    .update({
      status: "approved",
      role,
      class_year: classYear,
      approved_at: new Date().toISOString(),
      approved_by: actor.id,
    })
    .eq("id", id);

  await logAuditEvent({
    action: "user.approve",
    entity_type: "user_profile",
    entity_id: id,
    metadata: { role, classYear, approvedBy: actor.id },
  });

  updateTag("profiles");
  revalidatePath("/admin");
  revalidatePath("/users");
}

/**
 * Declines a signup. The row is kept rather than deleted so the same person
 * can't simply sign up again into a clean pending state, and so the decision
 * stays visible on the admin page.
 */
export async function rejectUserAction(formData: FormData) {
  const actor = await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("user_profiles")
    .update({ status: "rejected", approved_at: null, approved_by: actor.id })
    .eq("id", id);

  await logAuditEvent({
    action: "user.reject",
    entity_type: "user_profile",
    entity_id: id,
    metadata: { rejectedBy: actor.id },
  });

  updateTag("profiles");
  revalidatePath("/admin");
  revalidatePath("/users");
}

export async function assignSectorAction(formData: FormData) {
  await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  const sector = String(formData.get("sector") ?? "").trim() || null;
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("user_profiles").update({ coverage_sector: sector }).eq("id", id);

  updateTag("profiles");
  revalidatePath("/admin");
  revalidatePath("/coverage");
}

export async function deleteUserAction(formData: FormData) {
  await requireRole(["developer", "admin"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("user_profiles").delete().eq("id", id);
  await admin.auth.admin.deleteUser(id);

  await logAuditEvent({
    action: "user.delete",
    entity_type: "user_profile",
    entity_id: id,
    metadata: {},
  });

  updateTag("profiles");
  revalidatePath("/admin");
  revalidatePath("/users");
}
