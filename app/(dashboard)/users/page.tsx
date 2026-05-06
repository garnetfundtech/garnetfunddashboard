import { requireRole } from "@/lib/auth";
import { getFundUsers } from "@/lib/data";
import { UsersTableClient } from "@/components/dashboard/users-table-client";

export default async function UsersPage() {
  await requireRole(["pm", "admin", "developer"]);
  const users = await getFundUsers();
  return <UsersTableClient users={users} />;
}
