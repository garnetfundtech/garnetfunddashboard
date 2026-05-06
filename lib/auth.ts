import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
};

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    await supabase.from("user_profiles").upsert({
      id: user.id,
      email: user.email ?? "",
      full_name: user.user_metadata?.full_name ?? null,
      role: "analyst",
    });

    return {
      id: user.id,
      email: user.email ?? "",
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      role: "analyst" as const,
    };
  }

  return profile as Profile;
}

export async function requireProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return profile;
}

export async function requireRole(allowed: UserRole[]) {
  const profile = await requireProfile();

  if (!allowed.includes(profile.role)) {
    redirect("/home");
  }

  return profile;
}
