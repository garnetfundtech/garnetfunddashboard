import { inviteUserAction } from "@/app/(dashboard)/admin/actions";
import { getAdminUsers, getSchwabDiagnostics } from "@/lib/data";
import { requireRole } from "@/lib/auth";
import { ExternalApiStatusPanel } from "@/components/admin/external-api-status-panel";
import { RoleSelect } from "@/components/admin/role-select";
import { SectorSelect } from "@/components/admin/sector-select";
import { fetchPortfolioSummary, fetchMarketOverview } from "@/lib/market-data";
import { getExternalApiStatus } from "@/lib/external-api-status";

export default async function AdminPage() {
  await requireRole(["developer", "admin"]);

  const syncIntervalMin = Math.max(5, Number(process.env.SCHWAB_SYNC_INTERVAL_MINUTES ?? "60"));

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

      {/* Hidden form for the invite row — must live outside the table to be valid HTML */}
      <form id="invite-user-form" action={inviteUserAction} />

      {/* Users table with Send Invite as last row */}
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">Role</th>
              <th className="px-4 py-2.5 text-left font-medium">Coverage Sector</th>
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
              </tr>
            ))}

            {/* Send Invite row — last in the table */}
            <tr className="border-t border-white/[0.06]">
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <input
                    name="firstName"
                    form="invite-user-form"
                    placeholder="First"
                    className="glass-input w-full max-w-[100px] px-2.5 py-1.5 text-xs outline-none"
                    required
                  />
                  <input
                    name="lastName"
                    form="invite-user-form"
                    placeholder="Last"
                    className="glass-input w-full max-w-[100px] px-2.5 py-1.5 text-xs outline-none"
                    required
                  />
                </div>
              </td>
              <td className="px-4 py-3">
                <input
                  name="email"
                  form="invite-user-form"
                  type="email"
                  placeholder="email@example.com"
                  className="glass-input w-full px-2.5 py-1.5 text-xs outline-none"
                  required
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <select
                    name="role"
                    form="invite-user-form"
                    className="glass-input bg-transparent px-2.5 py-1.5 text-xs outline-none text-zinc-300"
                  >
                    <option value="analyst">Analyst</option>
                    <option value="pm">PM</option>
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                  </select>
                  <button
                    type="submit"
                    form="invite-user-form"
                    className="shrink-0 rounded-[8px] bg-[#8e0604] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#a80705] transition-colors"
                  >
                    Send Invite
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <ExternalApiStatusPanel rows={apiStatus} schwabDiagnostics={schwabDiagnostics} liveVerification={liveVerification} />
    </div>
  );
}
