import { requireProfile } from "@/lib/auth";
import { getFundUsers } from "@/lib/data";
import { Search } from "lucide-react";

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default async function UsersPage() {
  await requireProfile();
  const users = await getFundUsers();

  return (
    <div className="space-y-3 pt-2">
      <h1 className="page-title">Users</h1>
      <div className="glass-input flex w-full max-w-md items-center gap-2 px-3 py-2.5">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          placeholder="Search users..."
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
        />
      </div>

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Member</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="odd:bg-white/[0.015]">
                <td className="px-4 py-3 text-white">{user.fullName}</td>
                <td className="px-4 py-3 text-zinc-300">{formatRole(user.role)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        user.isOnline ? "bg-emerald-500" : "bg-[#8e0604]"
                      }`}
                    />
                    <span className="text-zinc-300">{user.isOnline ? "Online" : "Offline"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
