import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { canAccessDashboardPath } from "@/lib/nav-access";

export async function enforceNavAccess(pathname: string) {
  const profile = await requireProfile();
  if (!canAccessDashboardPath(profile.role, pathname)) {
    redirect("/home");
  }
  return profile;
}
