import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { UserRole } from "@/lib/types";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  coverage_sector: string | null;
};

export const getCurrentProfile = cache(async () => {
  // Without credentials there is no session to read — treat as logged out so
  // the app routes to /login instead of hitting a placeholder Supabase.
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,first_name,last_name,role,coverage_sector")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    const firstName = (user.user_metadata?.first_name as string | undefined) ?? null;
    const lastName = (user.user_metadata?.last_name as string | undefined) ?? null;
    const fallbackFromParts = [firstName, lastName].filter(Boolean).join(" ").trim();
    const metadataFullName = (user.user_metadata?.full_name as string | undefined) ?? null;
    const fallbackFullName = metadataFullName || fallbackFromParts || null;

    await supabase.from("user_profiles").upsert({
      id: user.id,
      email: user.email ?? "",
      full_name: fallbackFullName,
      first_name: firstName,
      last_name: lastName,
      role: "analyst",
    });

    return {
      id: user.id,
      email: user.email ?? "",
      full_name: fallbackFullName,
      first_name: firstName,
      last_name: lastName,
      role: "analyst" as const,
      coverage_sector: null,
    };
  }

  return profile as Profile;
});

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
