import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { requireProfile } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireProfile();
  if (!profile.first_name || !profile.last_name) {
    redirect("/onboarding");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background p-3">
      <SidebarNav
        role={profile.role}
        fullName={
          profile.full_name ||
          `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
          "Fund Member"
        }
      />
      <main className="h-full flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <PresenceHeartbeat />
        {children}
      </main>
    </div>
  );
}
