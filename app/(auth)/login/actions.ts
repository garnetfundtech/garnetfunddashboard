"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUscEmail, ACCEPTED_DOMAINS_LABEL } from "@/lib/usc-email";
import { normalizeClassYear } from "@/lib/class-years";

export type LoginState = {
  error?: string;
  success?: string;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/home");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signupAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!firstName || !lastName) {
    return { error: "Enter first and last name." };
  }
  if (!isUscEmail(email)) {
    return { error: `Sign up with your USC email address (${ACCEPTED_DOMAINS_LABEL}).` };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const classYear = normalizeClassYear(String(formData.get("classYear") ?? ""));
  const supabase = await createClient();
  const fullName = `${firstName} ${lastName}`.trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user?.id) {
    // Service role: RLS reserves profile writes for developers/admins, and a
    // brand-new signup is neither. Status is 'pending' until an admin approves.
    await createAdminClient().from("user_profiles").upsert({
      id: data.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      role: "analyst",
      class_year: classYear,
      status: "pending",
    });
  }

  if (data.session) {
    redirect("/pending");
  }

  return {
    success:
      "Account created. Confirm your email, then an admin will review your access request.",
  };
}
