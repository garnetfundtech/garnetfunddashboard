/**
 * Team file workspace data layer.
 *
 * Top-level "teams" are the GICS coverage sectors (see lib/sectors.ts). Inside
 * each sector, folders nest arbitrarily deep and files live at a sector root
 * (folder_id null) or inside exactly one folder.
 *
 * Read access is open to every signed-in user; write access is limited to your
 * own coverage_sector, with pm/admin/developer able to write anywhere. The
 * check lives in `canWriteSector` here and is mirrored by RLS in
 * supabase/migrations/0014_team_files.sql.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilePath } from "@/lib/storage";
import { GICS_SECTORS } from "@/lib/sectors";
import type { UserRole } from "@/lib/types";

export const TEAM_FILES_BUCKET = "team-files";

/** Roles that may write into any sector, not just their own. */
const CROSS_SECTOR_ROLES: UserRole[] = ["pm", "admin", "developer"];

export type TeamFolderRow = {
  id: string;
  sector: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  createdAt: string;
  /** Immediate subfolders. */
  folderCount: number;
  /** Files anywhere beneath this folder, so a nested drop still shows a count. */
  fileCount: number;
};

export type TeamFileRow = {
  id: string;
  sector: string;
  folderId: string | null;
  title: string;
  fileSize: number | null;
  mimeType: string | null;
  downloadEnabled: boolean;
  createdBy: string | null;
  uploaderName: string;
  uploaderRole: UserRole;
  createdAt: string;
  viewUrl?: string;
  downloadUrl?: string;
};

export type TeamBrowseData = {
  sector: string;
  folderId: string | null;
  /** Ancestors of the current folder, outermost first (excludes the sector). */
  breadcrumb: { id: string; name: string }[];
  folders: TeamFolderRow[];
  files: TeamFileRow[];
  /** Total files per sector, for the team switcher. */
  sectorFileCounts: Record<string, number>;
  /** Whether the viewer may upload/rename/delete in this sector. */
  canWrite: boolean;
};

export function canWriteSector(
  profile: { role: UserRole; coverage_sector: string | null },
  sector: string,
) {
  if (CROSS_SECTOR_ROLES.includes(profile.role)) return true;
  return profile.coverage_sector === sector;
}

type RawFolder = {
  id: string;
  sector: string;
  parent_id: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
};

/** Descendant folder ids of `rootId`, inclusive, from an in-memory folder set. */
function collectDescendantIds(folders: RawFolder[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parent_id) continue;
    const list = childrenOf.get(f.parent_id) ?? [];
    list.push(f.id);
    childrenOf.set(f.parent_id, list);
  }

  const out: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    out.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/**
 * One folder's ancestor chain, outermost first. Guards against a malformed
 * cycle so a bad row can't spin the request forever.
 */
function buildBreadcrumb(
  byId: Map<string, RawFolder>,
  folderId: string,
): { id: string; name: string }[] {
  const chain: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let cursor: string | null = folderId;

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = byId.get(cursor);
    if (!folder) break;
    chain.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parent_id;
  }

  return chain;
}

/**
 * Everything needed to render one folder view. Loads the sector's whole folder
 * tree in a single query (a sector holds tens of folders, not thousands) so
 * breadcrumbs and recursive counts need no extra round-trips.
 */
export async function getTeamBrowseData({
  sector,
  folderId,
  profile,
}: {
  sector: string;
  folderId: string | null;
  profile: { role: UserRole; coverage_sector: string | null };
}): Promise<TeamBrowseData> {
  const admin = createAdminClient();

  const [foldersRes, filesRes, sectorCountsRes] = await Promise.all([
    admin
      .from("team_folders")
      .select("id,sector,parent_id,name,created_by,created_at")
      .eq("sector", sector)
      .order("name"),
    admin
      .from("team_files")
      .select(
        "id,sector,folder_id,title,file_path,file_size,mime_type,download_enabled,created_by,uploader_name,uploader_role,created_at",
      )
      .eq("sector", sector)
      .order("created_at", { ascending: false }),
    admin.from("team_files").select("sector"),
  ]);

  const allFolders = (foldersRes.data ?? []) as RawFolder[];
  const allFiles = filesRes.data ?? [];

  const sectorFileCounts: Record<string, number> = {};
  for (const s of GICS_SECTORS) sectorFileCounts[s] = 0;
  for (const row of sectorCountsRes.data ?? []) {
    const key = (row as { sector: string }).sector;
    sectorFileCounts[key] = (sectorFileCounts[key] ?? 0) + 1;
  }

  const byId = new Map(allFolders.map((f) => [f.id, f]));
  // A folder id from the URL that isn't in this sector falls back to the root
  // rather than rendering an empty, un-navigable view.
  const activeFolderId = folderId && byId.has(folderId) ? folderId : null;

  const filesByFolder = new Map<string | null, typeof allFiles>();
  for (const file of allFiles) {
    const key = (file as { folder_id: string | null }).folder_id;
    const list = filesByFolder.get(key) ?? [];
    list.push(file);
    filesByFolder.set(key, list);
  }

  const childFolders = allFolders.filter((f) => f.parent_id === activeFolderId);

  const folders: TeamFolderRow[] = childFolders.map((folder) => {
    const subtree = collectDescendantIds(allFolders, folder.id);
    const fileCount = subtree.reduce(
      (sum, id) => sum + (filesByFolder.get(id)?.length ?? 0),
      0,
    );
    return {
      id: folder.id,
      sector: folder.sector,
      parentId: folder.parent_id,
      name: folder.name,
      createdBy: folder.created_by,
      createdAt: folder.created_at,
      folderCount: allFolders.filter((f) => f.parent_id === folder.id).length,
      fileCount,
    };
  });

  // No signed URLs here — /api/files/sign generates one on demand the
  // instant a file is actually opened, instead of the whole folder's worth
  // of Storage API calls on every navigation.
  const visibleFiles = filesByFolder.get(activeFolderId) ?? [];
  const files: TeamFileRow[] = visibleFiles.map((file) => {
      const row = file as {
        id: string;
        sector: string;
        folder_id: string | null;
        title: string;
        file_path: string;
        file_size: number | null;
        mime_type: string | null;
        download_enabled: boolean;
        created_by: string | null;
        uploader_name: string | null;
        uploader_role: UserRole | null;
        created_at: string;
      };

      return {
        id: row.id,
        sector: row.sector,
        folderId: row.folder_id,
        title: row.title,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        downloadEnabled: row.download_enabled,
        createdBy: row.created_by,
        uploaderName: row.uploader_name ?? "Unknown",
        uploaderRole: row.uploader_role ?? "analyst",
        createdAt: row.created_at,
      };
  });

  return {
    sector,
    folderId: activeFolderId,
    breadcrumb: activeFolderId ? buildBreadcrumb(byId, activeFolderId) : [],
    folders,
    files,
    sectorFileCounts,
    canWrite: canWriteSector(profile, sector),
  };
}

/**
 * Storage object paths for every file at or beneath `folderId`. Used before a
 * folder delete: the DB cascade drops the rows, but storage objects have to be
 * removed explicitly or they leak.
 */
export async function collectFolderStoragePaths(folderId: string) {
  const admin = createAdminClient();

  const { data: folder } = await admin
    .from("team_folders")
    .select("id,sector")
    .eq("id", folderId)
    .maybeSingle();

  if (!folder) return { sector: null as string | null, objectPaths: [] };

  const { data: folders } = await admin
    .from("team_folders")
    .select("id,sector,parent_id,name,created_by,created_at")
    .eq("sector", folder.sector);

  const ids = collectDescendantIds((folders ?? []) as RawFolder[], folderId);

  const { data: files } = await admin
    .from("team_files")
    .select("file_path")
    .in("folder_id", ids);

  const objectPaths = (files ?? [])
    .map((f) => parseFilePath((f as { file_path: string }).file_path).objectPath)
    .filter((p): p is string => Boolean(p));

  return { sector: folder.sector as string, objectPaths };
}
