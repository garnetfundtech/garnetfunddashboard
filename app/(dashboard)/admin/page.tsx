import { deleteUserAction } from "@/app/(dashboard)/admin/actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminExportButton } from "@/components/admin/admin-export-button";
import { getAdminUsers, getSchwabDiagnostics } from "@/lib/data";
import { requireRole } from "@/lib/auth";
import { ExternalApiStatusPanel } from "@/components/admin/external-api-status-panel";
import { RoleSelect } from "@/components/admin/role-select";
import { SectorSelect } from "@/components/admin/sector-select";
import { fetchPortfolioSummary, fetchMarketOverview } from "@/lib/market-data";
import { getExternalApiStatus } from "@/lib/external-api-status";

export default async function AdminPage() {
  await requireRole(["developer", "admin"]);

  const [users, schwabDiagnostics, livePortfolio, liveMarket, apiStatus] = await Promise.all([
    getAdminUsers(),
    getSchwabDiagnostics(),
    fetchPortfolioSummary(),
    fetchMarketOverview(),
    getExternalApiStatus(),
  ]);

  const liveVerification = livePortfolio || liveMarket
    ? {
        accountNumber:  livePortfolio?.accountNumber ?? null,
        liquidationValue: livePortfolio?.liquidationValue ?? null,
        cashAvailable:  livePortfolio?.cashAvailable ?? null,
        positionCount:  livePortfolio?.positionCount ?? null,
        spyPrice:  liveMarket?.indices.find((i) => i.symbol === "SPY")?.lastPrice ?? null,
        spyChange: liveMarket?.indices.find((i) => i.symbol === "SPY")?.pctChange ?? null,
        marketIsOpen: liveMarket?.isOpen ?? null,
        verifiedAt: livePortfolio?.verifiedAt ?? liveMarket?.fetchedAt ?? null,
      }
    : null;

  return (
    <div className="space-y-3">
      <PageHeader title="Admin" meta={`${users.length} member${users.length === 1 ? "" : "s"}`} actions={<AdminExportButton users={users} />} />
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper-2 text-ink-2">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium w-[130px]">Role</th>
              <th className="px-4 py-2.5 text-left font-medium w-[180px]">Coverage Sector</th>
              <th className="px-4 py-2.5 text-left font-medium w-[60px]"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="odd:bg-paper-3">
                <td className="px-4 py-3 text-ink">{user.full_name || "—"}</td>
                <td className="px-4 py-3 text-ink-2">{user.email}</td>
                <td className="px-4 py-3">
                  <RoleSelect userId={user.id} currentRole={user.role} />
                </td>
                <td className="px-4 py-3">
                  <SectorSelect userId={user.id} currentSector={user.coverage_sector ?? null} />
                </td>
                <td className="px-4 py-3">
                  <form action={deleteUserAction}>
                    <input type="hidden" name="id" value={user.id} />
                    <button
                      type="submit"
                      className="rounded-none px-2.5 py-1.5 text-xs font-medium text-ink-3 hover:bg-neg-soft hover:text-neg transition-colors"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ExternalApiStatusPanel rows={apiStatus} schwabDiagnostics={schwabDiagnostics} liveVerification={liveVerification} />
    </div>
  );
}
