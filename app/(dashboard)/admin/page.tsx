import { inviteUserAction, updateUserRoleAction } from "@/app/(dashboard)/admin/actions";
import { getAdminUsers, getAuditEvents, getResourcesWithUrls, getSchwabDiagnostics } from "@/lib/data";
import { requireRole } from "@/lib/auth";
import { SchwabDiagnosticPanel } from "@/components/admin/schwab-diagnostic-panel";
import { fetchPortfolioSummary, fetchMarketOverview } from "@/lib/market-data";

export default async function AdminPage() {
  await requireRole(["developer", "admin"]);
  const [users, audits, resources, schwabDiagnostics, livePortfolio, liveMarket] =
    await Promise.all([
      getAdminUsers(),
      getAuditEvents(),
      getResourcesWithUrls(),
      getSchwabDiagnostics(),
      fetchPortfolioSummary(),
      fetchMarketOverview(),
    ]);

  const liveVerification = livePortfolio || liveMarket
    ? {
        accountNumber: livePortfolio?.accountNumber ?? null,
        liquidationValue: livePortfolio?.liquidationValue ?? null,
        cashAvailable: livePortfolio?.cashAvailable ?? null,
        positionCount: livePortfolio?.positionCount ?? null,
        spyPrice: liveMarket?.indices.find((i) => i.symbol === "SPY")?.lastPrice ?? null,
        spyChange: liveMarket?.indices.find((i) => i.symbol === "SPY")?.pctChange ?? null,
        marketIsOpen: liveMarket?.isOpen ?? null,
        verifiedAt: livePortfolio?.verifiedAt ?? liveMarket?.fetchedAt ?? null,
      }
    : null;

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Admin</h1>

      <section className="panel p-4">
        <form action={inviteUserAction} className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <input name="firstName" placeholder="First name" className="glass-input px-3 py-2 text-sm outline-none" required />
          <input name="lastName" placeholder="Last name" className="glass-input px-3 py-2 text-sm outline-none" required />
          <input name="email" placeholder="name@example.com" className="glass-input px-3 py-2 text-sm outline-none md:col-span-2" required />
          <select name="role" className="glass-input px-3 py-2 text-sm outline-none">
            <option value="analyst">Analyst</option>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
          </select>
          <button className="rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white">Send Invite</button>
        </form>
      </section>

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Save</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="odd:bg-white/[0.015]">
                <td className="px-4 py-3 text-white">{user.full_name || "No name yet"}</td>
                <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                <td className="px-4 py-3">
                  <form action={updateUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={user.id} />
                    <select name="role" defaultValue={user.role} className="glass-input px-3 py-2 text-xs outline-none">
                      <option value="analyst">Analyst</option>
                      <option value="admin">Admin</option>
                      <option value="developer">Developer</option>
                    </select>
                    <button className="rounded-[10px] bg-[#8e0604] px-3 py-1.5 text-xs font-medium text-white">Save</button>
                  </form>
                </td>
                <td className="px-4 py-3 text-zinc-500">Role update</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <SchwabDiagnosticPanel data={schwabDiagnostics} liveVerification={liveVerification} />

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <article className="panel p-4">
          <p className="caps-label">File Permissions</p>
          <div className="mt-3 space-y-2">
            {resources.map((resource) => (
              <div key={resource.id} className="rounded-[10px] bg-white/[0.03] px-3 py-2">
                <p className="text-sm text-white">{resource.title}</p>
                <p className="text-xs text-zinc-400">
                  Download: {resource.downloadEnabled ? "Enabled" : "Disabled"}
                </p>
              </div>
            ))}
          </div>
        </article>
        <article className="panel p-4">
          <p className="caps-label">Audit Trail</p>
          <div className="mt-3 space-y-2">
            {audits.length === 0 ? (
              <p className="text-sm text-zinc-400">No events logged yet.</p>
            ) : (
              audits.map((event) => (
                <div key={event.id} className="rounded-[10px] bg-white/[0.03] px-3 py-2">
                  <p className="text-sm text-white">
                    {event.action} · {event.entity_type}
                  </p>
                  <p className="text-xs text-zinc-400">{new Date(event.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
