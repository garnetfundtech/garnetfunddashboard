import { deleteUserAction } from "@/app/(dashboard)/admin/actions";
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
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
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
              <tr key={user.id} className="odd:bg-white/[0.015]">
                <td className="px-4 py-3 text-white">{user.full_name || "—"}</td>
                <td className="px-4 py-3 text-zinc-400">{user.email}</td>
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
                      className="rounded-[6px] px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
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
