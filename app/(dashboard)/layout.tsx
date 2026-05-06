import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { TopBar } from "@/components/dashboard/top-bar";
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
    <div className="flex min-h-screen bg-background">
      <SidebarNav
        role={profile.role}
        fullName={
          profile.full_name ||
          `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
          "Fund Member"
        }
      />
      <main className="flex-1 px-4 py-4 lg:px-6">
        <TopBar />
        {children}
      </main>
    </div>
  );
}
