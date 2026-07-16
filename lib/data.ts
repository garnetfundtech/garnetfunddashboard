import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilePath } from "@/lib/storage";
import {
  fetchPortfolioSummary,
  fetchMarketOverview,
  fetchBenchmarkHistory,
} from "@/lib/market-data";
import type {
  FundUser,
  PitchRow,
  PitchStage,
  ResearchItem,
  ResourceItem,
  ThesisStatus,
  UserRole,
  WatchlistRow,
  PortfolioSummary,
  MarketOverview,
  BenchmarkCandle,
} from "@/lib/types";

// ── Live homepage data ────────────────────────────────────────────────────────

export type HomepageData = {
  portfolio: PortfolioSummary | null;
  market: MarketOverview | null;
  benchmarkYtd: BenchmarkCandle[];
};

export async function getHomepageData(): Promise<HomepageData> {
  const [portfolio, market, benchmark] = await Promise.allSettled([
    fetchPortfolioSummary(),
    fetchMarketOverview(),
    fetchBenchmarkHistory("YTD"),
  ]);

  return {
    portfolio: portfolio.status === "fulfilled" ? portfolio.value : null,
    market: market.status === "fulfilled" ? market.value : null,
    benchmarkYtd: benchmark.status === "fulfilled" && benchmark.value
      ? benchmark.value.candles
      : [],
  };
}

export async function getResearchItems(): Promise<ResearchItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_posts")
    .select(
      "id, title, ticker, created_at, file_path, author_override, download_enabled, created_by, uploader_role, sector, thesis_status, analyst_name, ai_analysis",
    )
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

    const ts = (row as { thesis_status?: string }).thesis_status;
    const validThesis: ThesisStatus =
      ts === "under_review" || ts === "became_position" || ts === "rejected" || ts === "active"
        ? ts
        : "active";

    mapped.push({
      id: row.id,
      title: row.title,
      author: row.author_override ?? "Unknown",
      ticker: row.ticker ?? "—",
      updatedAt: new Date(row.created_at).toLocaleDateString(),
      createdBy: row.created_by ?? null,
      uploaderRole: (row.uploader_role as UserRole) ?? "analyst",
      filePath: row.file_path ?? undefined,
      viewUrl,
      downloadEnabled: row.download_enabled ?? false,
      downloadUrl,
      sector: (row as { sector?: string | null }).sector ?? null,
      thesisStatus: validThesis,
      analystName: (row as { analyst_name?: string | null }).analyst_name ?? null,
      aiAnalysis: (row as { ai_analysis?: unknown }).ai_analysis as import("@/lib/types").StoredAnalysis | null ?? null,
    });
  }

  return mapped;
}

export type ResourceWithLinks = ResourceItem & {
  file_path?: string;
  viewUrl?: string;
  downloadUrl?: string;
  uploadedBy: string;
  createdBy: string | null;
  uploaderRole: UserRole;
};

export async function getResourcesWithUrls(): Promise<ResourceWithLinks[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources_files")
    .select("id,title,category,download_enabled,created_at,file_path,uploader_name,created_by,uploader_role")
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
      uploadedBy: resource.uploader_name ?? "Unknown",
      createdBy: resource.created_by ?? null,
      uploaderRole: (resource.uploader_role as UserRole) ?? "analyst",
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
  coverage_sector: string | null;
  created_at: string;
};

export async function getAdminUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,role,coverage_sector,created_at")
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

export type SchwabTokenStatus = {
  present: boolean;
  needsReauth: boolean;
  expiresAt: string | null;
  /** Schwab refresh token expiry when provided by broker */
  refreshExpiresAt: string | null;
  updatedAt: string | null;
};

export type SchwabSyncResult = {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  level: string | null;
  message: string | null;
  accountCount: number;
  positionCount: number;
  totalMarketValue: number;
  insertedHoldingsRows: number;
  capturedAt: string | null;
  accountBalances: {
    accountNumber: string;
    accountType: string;
    liquidationValue: number;
    cashAvailableForTrading: number;
    longMarketValue: number;
    mutualFundValue: number;
  }[];
};

export type SchwabDiagnostics = {
  token: SchwabTokenStatus;
  lastSync: SchwabSyncResult | null;
};

export async function getSchwabDiagnostics(): Promise<SchwabDiagnostics> {
  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from("schwab_tokens")
    .select("needs_reauth, expires_at, refresh_expires_at, updated_at")
    .eq("id", "trader")
    .single();

  const { data: jobRow } = await admin
    .from("sync_jobs")
    .select("id, status, started_at, finished_at")
    .eq("provider", "schwab")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  let lastSync: SchwabSyncResult | null = null;

  if (jobRow) {
    const { data: logRow } = await admin
      .from("sync_logs")
      .select("level, message, payload")
      .eq("sync_job_id", jobRow.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const p = (logRow?.payload ?? {}) as Record<string, unknown>;
    lastSync = {
      status: jobRow.status,
      startedAt: jobRow.started_at,
      finishedAt: jobRow.finished_at ?? null,
      level: logRow?.level ?? null,
      message: logRow?.message ?? null,
      accountCount: Number(p.accountCount ?? 0),
      positionCount: Number(p.positionCount ?? 0),
      totalMarketValue: Number(p.totalMarketValue ?? 0),
      insertedHoldingsRows: Number(p.insertedHoldingsRows ?? 0),
      capturedAt: (p.capturedAt as string) ?? null,
      accountBalances: Array.isArray(p.accountBalances)
        ? (p.accountBalances as SchwabSyncResult["accountBalances"])
        : [],
    };
  }

  return {
    token: {
      present: !!tokenRow,
      needsReauth: tokenRow?.needs_reauth ?? false,
      expiresAt: tokenRow?.expires_at ?? null,
      refreshExpiresAt: (tokenRow as { refresh_expires_at?: string | null })?.refresh_expires_at ?? null,
      updatedAt: tokenRow?.updated_at ?? null,
    },
    lastSync,
  };
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

function displayName(p: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  return (
    p.full_name?.trim() ||
    `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
    "Unknown"
  );
}

export async function getPitches(): Promise<PitchRow[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("pitches")
    .select("id, ticker, analyst_id, thesis, stage, research_id, position_symbol, notes, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error || !rows?.length) return [];

  const ids = [...new Set(rows.map((r) => r.analyst_id as string))];
  const { data: profs } = await supabase
    .from("user_profiles")
    .select("id, full_name, first_name, last_name")
    .in("id", ids);

  const nameById = new Map<string, string>();
  for (const p of profs ?? []) {
    nameById.set(p.id, displayName(p));
  }

  return rows.map((r) => ({
    id: r.id as string,
    ticker: String(r.ticker),
    analystId: r.analyst_id as string,
    analystName: nameById.get(r.analyst_id as string) ?? "Unknown",
    thesis: String(r.thesis ?? ""),
    stage: r.stage as PitchStage,
    researchId: (r.research_id as string | null) ?? null,
    positionSymbol: (r.position_symbol as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

export async function getWatchlistRows(): Promise<WatchlistRow[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("watchlist_items")
    .select("id, ticker, added_by, pitch_id, analyst_target, notes, created_at")
    .order("created_at", { ascending: false });

  if (error || !rows?.length) return [];

  const ids = [...new Set(rows.map((r) => r.added_by as string))];
  const { data: profs } = await supabase
    .from("user_profiles")
    .select("id, full_name, first_name, last_name")
    .in("id", ids);

  const nameById = new Map<string, string>();
  for (const p of profs ?? []) {
    nameById.set(p.id, displayName(p));
  }

  return rows.map((r) => ({
    id: r.id as string,
    ticker: String(r.ticker).toUpperCase(),
    addedBy: r.added_by as string,
    adderName: nameById.get(r.added_by as string) ?? "Unknown",
    pitchId: (r.pitch_id as string | null) ?? null,
    analystTarget: (r.analyst_target as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function getWatchlistTickers(): Promise<string[]> {
  const rows = await getWatchlistRows();
  return rows.map((r) => r.ticker);
}

export async function getResearchOptionsForPipeline(): Promise<{ id: string; title: string; ticker: string | null; viewUrl: string | null }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_posts")
    .select("id, title, ticker, view_url, file_path")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error || !data) return [];

  const admin = createAdminClient();
  const results: { id: string; title: string; ticker: string | null; viewUrl: string | null }[] = [];

  for (const r of data) {
    let viewUrl = (r.view_url as string | null) ?? null;

    if (!viewUrl && r.file_path) {
      const { bucket, objectPath } = parseFilePath(r.file_path as string);
      if (bucket && objectPath) {
        const view = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10);
        if (view.data?.signedUrl) viewUrl = view.data.signedUrl;
      }
    }

    results.push({
      id: r.id as string,
      title: r.title as string,
      ticker: (r.ticker as string | null) ?? null,
      viewUrl,
    });
  }

  return results;
}

export async function getResearchItemsForUser(userId: string): Promise<ResearchItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("research_posts")
    .select(
      "id, title, ticker, created_at, file_path, author_override, download_enabled, created_by, uploader_role, sector, thesis_status, analyst_name, ai_analysis",
    )
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const mapped: ResearchItem[] = [];
  for (const row of data) {
    let viewUrl: string | undefined;
    if (row.file_path) {
      const { bucket, objectPath } = parseFilePath(row.file_path);
      if (bucket && objectPath) {
        const view = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10);
        if (view.data?.signedUrl) viewUrl = view.data.signedUrl;
      }
    }
    const ts = (row as { thesis_status?: string }).thesis_status;
    const validThesis: ThesisStatus =
      ts === "under_review" || ts === "became_position" || ts === "rejected" || ts === "active"
        ? ts
        : "active";
    mapped.push({
      id: row.id,
      title: row.title,
      author: row.author_override ?? "Unknown",
      ticker: row.ticker ?? "—",
      updatedAt: new Date(row.created_at).toLocaleDateString(),
      createdBy: row.created_by ?? null,
      uploaderRole: (row.uploader_role as UserRole) ?? "analyst",
      filePath: row.file_path ?? undefined,
      viewUrl,
      downloadEnabled: row.download_enabled ?? false,
      downloadUrl: undefined,
      sector: (row as { sector?: string | null }).sector ?? null,
      thesisStatus: validThesis,
      analystName: (row as { analyst_name?: string | null }).analyst_name ?? null,
      aiAnalysis: (row as { ai_analysis?: unknown }).ai_analysis as import("@/lib/types").StoredAnalysis | null ?? null,
    });
  }
  return mapped;
}
