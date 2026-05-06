import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { holdings } from "@/lib/mock-data";
import { parseFilePath } from "@/lib/storage";
import type { FundUser, HoldingRow, ResearchItem, ResourceItem, UserRole } from "@/lib/types";

export async function getHoldings(): Promise<HoldingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holdings_snapshots")
    .select("ticker, company_name, sector")
    .order("captured_at", { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return holdings;
  }

  return data.map((row) => ({
    ticker: row.ticker,
    name: row.company_name,
    sector: row.sector,
    day1: "0.0%",
    day5: "0.0%",
    month1: "0.0%",
    month3: "0.0%",
    month6: "0.0%",
    year1: "0.0%",
    ytd: "0.0%",
    annualized: "0.0%",
  }));
}

export async function getResearchItems(): Promise<ResearchItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_posts")
    .select("id, title, ticker, created_at, file_path, author_override, download_enabled")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !data) return [];

  const admin = createAdminClient();
  const mapped: ResearchItem[] = [];

  for (const row of data) {
    let viewUrl: string | undefined;
    let downloadUrl: string | undefined;

    if (row.file_path) {
      const { bucket, objectPath } = parseFilePath(row.file_path);
      if (bucket && objectPath) {
        const view = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10);
        if (view.data?.signedUrl) viewUrl = view.data.signedUrl;

        if (row.download_enabled) {
          const dl = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10, { download: true });
          if (dl.data?.signedUrl) downloadUrl = dl.data.signedUrl;
        }
      }
    }

    mapped.push({
      id: row.id,
      title: row.title,
      author: row.author_override ?? "Unknown",
      ticker: row.ticker ?? "—",
      updatedAt: new Date(row.created_at).toLocaleDateString(),
      filePath: row.file_path ?? undefined,
      viewUrl,
      downloadEnabled: row.download_enabled ?? false,
      downloadUrl,
    });
  }

  return mapped;
}

export type ResourceWithLinks = ResourceItem & {
  file_path?: string;
  viewUrl?: string;
  downloadUrl?: string;
};

export async function getResourcesWithUrls(): Promise<ResourceWithLinks[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources_files")
    .select("id,title,category,download_enabled,created_at,file_path")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !data) return [];

  const admin = createAdminClient();
  const mapped: ResourceWithLinks[] = [];

  for (const resource of data) {
    let viewUrl: string | undefined;
    let downloadUrl: string | undefined;

    if (resource.file_path) {
      const { bucket, objectPath } = parseFilePath(resource.file_path);
      if (bucket && objectPath) {
        const view = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10);
        if (view.data?.signedUrl) {
          viewUrl = view.data.signedUrl;
        }
        if (resource.download_enabled) {
          const dl = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10, {
            download: true,
          });
          if (dl.data?.signedUrl) {
            downloadUrl = dl.data.signedUrl;
          }
        }
      }
    }

    mapped.push({
      id: resource.id,
      title: resource.title,
      category: resource.category as ResourceItem["category"],
      downloadEnabled: resource.download_enabled,
      updatedAt: new Date(resource.created_at).toLocaleDateString(),
      file_path: resource.file_path,
      viewUrl,
      downloadUrl,
    });
  }

  return mapped;
}

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
};

export async function getAdminUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,role,created_at")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as AdminUser[];
}

export type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export async function getAuditEvents(): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_events")
    .select("id,action,entity_type,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !data) return [];
  return data as AuditEntry[];
}

export async function getFundUsers(): Promise<FundUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,full_name,first_name,last_name,role,user_presence(last_seen_at)")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const activeWindowMs = 1000 * 60 * 2;
  const now = Date.now();

  return data.map((user) => {
    const presence = Array.isArray(user.user_presence) ? user.user_presence[0] : user.user_presence;
    const lastSeenAt = presence?.last_seen_at ?? null;
    const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
    const fallbackName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Unknown User";

    return {
      id: user.id,
      fullName: user.full_name || fallbackName,
      role: user.role as UserRole,
      isOnline: Boolean(lastSeenAt && now - lastSeenMs <= activeWindowMs),
      lastSeenAt,
    };
  });
}
