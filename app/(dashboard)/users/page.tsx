import { requireProfile } from "@/lib/auth";
import { getFundUsers } from "@/lib/data";
import { UsersTableClient } from "@/components/dashboard/users-table-client";

export default async function UsersPage() {
  await requireProfile();
  const users = await getFundUsers();
  return <UsersTableClient users={users} />;
}
