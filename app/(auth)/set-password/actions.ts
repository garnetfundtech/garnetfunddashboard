"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LoginState } from "@/app/(auth)/login/actions";

/**
 * Finishes an invite. The session already exists (set by /auth/callback), so
 * the email is fixed to the invited address and only a password is collected.
 */
export async function setPasswordAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your invite link has expired. Ask an admin to resend the invite." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  // Invites carry first/last name in user metadata; mirror it onto the profile
  // row so the invitee skips /onboarding and lands straight on the dashboard.
  const firstName = (user.user_metadata?.first_name as string | undefined)?.trim() || null;
  const lastName = (user.user_metadata?.last_name as string | undefined)?.trim() || null;

  if (firstName && lastName) {
    await supabase
      .from("user_profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
      })
      .eq("id", user.id);
    redirect("/home");
  }

  redirect("/onboarding");
}
