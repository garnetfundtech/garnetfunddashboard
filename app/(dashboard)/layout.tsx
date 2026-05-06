import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { TopBar } from "@/components/dashboard/top-bar";
import { requireProfile } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireProfile();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-3 p-3">
      <SidebarNav role={profile.role} />
      <main className="flex-1 space-y-3">
        <TopBar email={profile.email} role={profile.role} />
        {children}
      </main>
    </div>
  );
}
