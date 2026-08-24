"use client";

import { Download } from "lucide-react";
import { GhostBtn } from "@/components/dashboard/buttons";
import { downloadCsv } from "@/lib/csv-client";
import type { AdminUser } from "@/lib/data";

export function AdminExportButton({ users }: { users: AdminUser[] }) {
  return (
    <GhostBtn
      onClick={() =>
        downloadCsv(
          ["Name", "Email", "Role", "Coverage Sector", "Created At"],
          users.map((u) => [u.full_name ?? "", u.email, u.role, u.coverage_sector ?? "", u.created_at]),
          "garnet-fund-members.csv",
        )
      }
    >
      <Download className="h-3.5 w-3.5" />
      Export
    </GhostBtn>
  );
}
