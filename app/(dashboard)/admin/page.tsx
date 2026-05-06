import { inviteUserAction, updateUserRoleAction } from "@/app/(dashboard)/admin/actions";
import { getAdminUsers, getAuditEvents, getResourcesWithUrls } from "@/lib/data";
import { requireRole } from "@/lib/auth";

export default async function AdminPage() {
  await requireRole(["developer", "admin"]);
  const users = await getAdminUsers();
  const audits = await getAuditEvents();
  const resources = await getResourcesWithUrls();

  return (
    <div className="space-y-3">
      <section className="panel p-4">
        <p className="caps-label">Role Controls</p>
        <h1 className="text-lg font-semibold text-white">Developer / Admin Management</h1>
        <p className="text-sm text-zinc-400">
          Invite-only onboarding and role assignment controls will be connected to Supabase next.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <article className="panel p-4">
          <p className="caps-label">Invite Member</p>
          <form action={inviteUserAction} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                name="firstName"
                placeholder="First name"
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none"
                required
              />
              <input
                name="lastName"
                placeholder="Last name"
                className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none"
                required
              />
            </div>
            <input
              name="email"
              placeholder="name@example.com"
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none"
              required
            />
            <select
              name="role"
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none"
            >
              <option value="analyst">Analyst</option>
              <option value="admin">Admin</option>
              <option value="developer">Developer</option>
            </select>
            <button className="w-full rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white">
              Send Invite
            </button>
          </form>
        </article>
        <article className="panel p-4">
          <p className="caps-label">Team Roles</p>
          <div className="mt-3 space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2"
              >
                <p className="text-xs text-zinc-400">{user.full_name || "No name yet"}</p>
                <p className="text-xs text-zinc-500">{user.email}</p>
                <form action={updateUserRoleAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="id" value={user.id} />
                  <select
                    name="role"
                    defaultValue={user.role}
                    className="flex-1 rounded-md border border-[var(--border)] bg-background px-2 py-1 text-xs outline-none"
                  >
                    <option value="analyst">Analyst</option>
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                  </select>
                  <button className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-zinc-300">
                    Save
                  </button>
                </form>
              </div>
            ))}
          </div>
        </article>
        <article className="panel p-4">
          <p className="caps-label">File Permissions</p>
          <div className="mt-3 space-y-2">
            {resources.map((resource) => (
              <div key={resource.id} className="rounded-[10px] border border-[var(--border)] px-3 py-2">
                <p className="text-sm text-white">{resource.title}</p>
                <p className="text-xs text-zinc-400">
                  Download: {resource.downloadEnabled ? "Enabled" : "Disabled"}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel p-4">
        <p className="caps-label">Audit Trail</p>
        <div className="mt-3 space-y-2">
          {audits.length === 0 ? (
            <p className="text-sm text-zinc-400">No events logged yet.</p>
          ) : (
            audits.map((event) => (
              <div key={event.id} className="rounded-[10px] border border-[var(--border)] px-3 py-2">
                <p className="text-sm text-white">
                  {event.action} · {event.entity_type}
                </p>
                <p className="text-xs text-zinc-400">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
