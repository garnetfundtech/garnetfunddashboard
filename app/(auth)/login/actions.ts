"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  if (!email.endsWith("@email.sc.edu")) {
    return { error: "You must sign up with your USC email address (@email.sc.edu)." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

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
    await supabase.from("user_profiles").upsert({
      id: data.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      role: "analyst",
    });
  }

  if (data.session) {
    redirect("/home");
  }

  return { success: "Account created. Check your email to confirm sign up." };
}
