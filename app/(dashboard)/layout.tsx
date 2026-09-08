import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { DashboardTopRow } from "@/components/dashboard/dashboard-top-row";
import { PageHeaderProvider } from "@/components/dashboard/page-header-context";
import { requireApprovedProfile } from "@/lib/auth";
import { getSearchIndex } from "@/lib/search";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireApprovedProfile();
  if (!profile.first_name || !profile.last_name) {
    redirect("/onboarding");
  }

  const searchIndex = await getSearchIndex().catch(() => []);

  return (
    <div className="flex h-screen gap-2 overflow-hidden bg-background p-2">
      <SidebarNav
        role={profile.role}
        fullName={
          profile.full_name ||
          `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
          "Fund Member"
        }
      />
      <PageHeaderProvider>
        {/* min-w-0 is load-bearing. A flex item defaults to min-width:auto,
            which means it refuses to shrink below its content's intrinsic
            width — so one wide table (the risk position table has twenty
            columns) pushes this element past the viewport and every panel on
            the page overflows to the right with it. With min-w-0 the main
            column tracks the viewport and the scroll containers inside it do
            their job. */}
        <main className="flex h-full min-w-0 flex-1 flex-col gap-2">
          <PresenceHeartbeat />
          <DashboardTopRow searchIndex={searchIndex} />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
        </main>
      </PageHeaderProvider>
    </div>
  );
}
