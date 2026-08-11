"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureStorageBuckets,
  buildStorageObjectPath,
  parseFilePath,
} from "@/lib/storage";
import { logAuditEvent } from "@/lib/audit";
import { isGicsSector } from "@/lib/sectors";
import {
  TEAM_FILES_BUCKET,
  canWriteSector,
  collectFolderStoragePaths,
} from "@/lib/team-files";
import { canManageContent } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

/** Shape returned to the client so the UI can surface a reason on refusal. */
export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Resolves the sector a folder belongs to. Every write is authorized against
 * the folder's own sector rather than a sector supplied by the client, so a
 * forged form field can't move a write into a team you don't belong to.
 */
async function sectorForFolder(folderId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_folders")
    .select("sector")
    .eq("id", folderId)
    .maybeSingle();
  return (data as { sector: string } | null)?.sector ?? null;
}

export async function createFolderAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const requestedSector = String(formData.get("sector") ?? "").trim();

  if (!name) return { ok: false, error: "Folder name is required." };
  if (name.length > 80) {
    return { ok: false, error: "Folder name must be 80 characters or fewer." };
  }

  // Nested folders inherit the parent's sector; only a root folder takes the
  // sector straight from the request.
  const sector = parentId ? await sectorForFolder(parentId) : requestedSector;
  if (!sector || !isGicsSector(sector)) {
    return { ok: false, error: "Unknown team." };
  }
  if (!canWriteSector(profile, sector)) {
    return { ok: false, error: `You can only add folders to ${profile.coverage_sector ?? "your own team"}.` };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("team_folders").insert({
    sector,
    parent_id: parentId,
    name,
    created_by: profile.id,
  });

  if (error) {
    // 23505 is unique_violation — the sibling-name indexes in migration 0014.
    if (error.code === "23505") {
      return { ok: false, error: `A folder named "${name}" already exists here.` };
    }
    return { ok: false, error: "Could not create the folder." };
  }

  await logAuditEvent({
    action: "team_folder.create",
    entity_type: "team_folder",
    metadata: { sector, name, parentId },
  });

  revalidatePath("/files");
  return { ok: true };
}

export async function renameFolderAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!id || !name) return { ok: false, error: "Folder name is required." };
  if (name.length > 80) {
    return { ok: false, error: "Folder name must be 80 characters or fewer." };
  }

  const sector = await sectorForFolder(id);
  if (!sector) return { ok: false, error: "Folder not found." };
  if (!canWriteSector(profile, sector)) {
    return { ok: false, error: "You can only rename folders in your own team." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_folders")
    .update({ name })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `A folder named "${name}" already exists here.` };
    }
    return { ok: false, error: "Could not rename the folder." };
  }

  await logAuditEvent({
    action: "team_folder.rename",
    entity_type: "team_folder",
    entity_id: id,
    metadata: { sector, name },
  });

  revalidatePath("/files");
  return { ok: true };
}

/** Deletes a folder, every folder beneath it, and all of their files. */
export async function deleteFolderAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Folder not found." };

  const { sector, objectPaths } = await collectFolderStoragePaths(id);
  if (!sector) return { ok: false, error: "Folder not found." };
  if (!canWriteSector(profile, sector)) {
    return { ok: false, error: "You can only delete folders in your own team." };
  }

  const admin = createAdminClient();

  // Storage first: if the row cascade succeeded and this failed, the objects
  // would be orphaned with no row left pointing at them.
  if (objectPaths.length > 0) {
    await admin.storage.from(TEAM_FILES_BUCKET).remove(objectPaths);
  }

  const { error } = await admin.from("team_folders").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete the folder." };

  await logAuditEvent({
    action: "team_folder.delete",
    entity_type: "team_folder",
    entity_id: id,
    metadata: { sector, filesRemoved: objectPaths.length },
  });

  revalidatePath("/files");
  return { ok: true };
}

export async function uploadTeamFileAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const folderId = String(formData.get("folderId") ?? "").trim() || null;
  const requestedSector = String(formData.get("sector") ?? "").trim();
  const downloadEnabled = formData.get("downloadEnabled") !== "false";

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Files must be 20 MB or smaller." };
  }
  if (!title) return { ok: false, error: "A title is required." };

  const sector = folderId ? await sectorForFolder(folderId) : requestedSector;
  if (!sector || !isGicsSector(sector)) {
    return { ok: false, error: "Unknown team." };
  }
  if (!canWriteSector(profile, sector)) {
    return {
      ok: false,
      error: `You can only upload to ${profile.coverage_sector ?? "your own team"}.`,
    };
  }

  const uploaderName =
    profile.full_name ||
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    "Unknown";

  await ensureStorageBuckets();
  const admin = createAdminClient();
  const objectPath = buildStorageObjectPath(file);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(TEAM_FILES_BUCKET)
    .upload(objectPath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) return { ok: false, error: "Upload failed." };

  const { data, error } = await admin
    .from("team_files")
    .insert({
      sector,
      folder_id: folderId,
      title,
      file_path: `${TEAM_FILES_BUCKET}/${objectPath}`,
      file_size: file.size,
      mime_type: file.type || null,
      download_enabled: downloadEnabled,
      created_by: profile.id,
      uploader_name: uploaderName,
      uploader_role: profile.role,
    })
    .select("id")
    .single();

  if (error) {
    // Don't leave the object behind if the row never landed.
    await admin.storage.from(TEAM_FILES_BUCKET).remove([objectPath]);
    return { ok: false, error: "Could not save the file." };
  }

  await logAuditEvent({
    action: "team_file.upload",
    entity_type: "team_file",
    entity_id: data?.id ?? null,
    metadata: { sector, folderId, title, size: file.size },
  });

  revalidatePath("/files");
  return { ok: true };
}

export async function deleteTeamFileAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "File not found." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("team_files")
    .select("id,sector,file_path,created_by,uploader_role")
    .eq("id", id)
    .maybeSingle();

  if (!row) return { ok: false, error: "File not found." };

  const file = row as {
    sector: string;
    file_path: string;
    created_by: string | null;
    uploader_role: UserRole | null;
  };

  if (!canWriteSector(profile, file.sector)) {
    return { ok: false, error: "You can only delete files in your own team." };
  }

  // Within a team, you still can't delete a teammate's file unless you outrank
  // them — same rule the research and resources tables already use.
  const allowed = canManageContent({
    actorId: profile.id,
    actorRole: profile.role,
    ownerId: file.created_by,
    ownerRole: file.uploader_role ?? "analyst",
  });
  if (!allowed) {
    return { ok: false, error: "Only the uploader or a senior role can delete this." };
  }

  const { objectPath } = parseFilePath(file.file_path);
  if (objectPath) {
    await admin.storage.from(TEAM_FILES_BUCKET).remove([objectPath]);
  }

  const { error } = await admin.from("team_files").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete the file." };

  await logAuditEvent({
    action: "team_file.delete",
    entity_type: "team_file",
    entity_id: id,
    metadata: { sector: file.sector },
  });

  revalidatePath("/files");
  return { ok: true };
}
