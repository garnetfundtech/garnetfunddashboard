"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilePath, statStorageObject } from "@/lib/storage";
import { verifyUploadGrant } from "@/lib/upload-grant";
import { logAuditEvent } from "@/lib/audit";
import { isRoleHigher } from "@/lib/roles";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Bucket fund-wide resource documents live in. */
const RESOURCES_BUCKET = "resources";

/**
 * Records a resource whose file is already in storage.
 *
 * Same move as research and team files: the bytes go straight to Supabase so
 * the upload is not capped by what fits in a Server Action request, and only
 * this metadata comes back through the server. See lib/uploads.ts.
 *
 * Still admin-only — that is re-checked here rather than trusted from the
 * grant, so a role revoked between authorizing the upload and saving it
 * takes effect.
 */
export async function recordResourceAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireRole(["developer", "admin"]);

  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "training");
  const downloadEnabled = formData.get("downloadEnabled") === "on";
  const grantToken = String(formData.get("grant") ?? "");

  if (!title) return { ok: false, error: "A file title is required." };

  const grant = verifyUploadGrant(grantToken);
  if (!grant) {
    return {
      ok: false,
      error: "That upload expired before it was saved. Try uploading again.",
    };
  }
  if (grant.bucket !== RESOURCES_BUCKET) {
    return { ok: false, error: "That upload wasn't for resources." };
  }

  const { objectPath } = grant;
  const admin = createAdminClient();

  const stored = await statStorageObject(RESOURCES_BUCKET, objectPath);
  if (!stored) {
    return { ok: false, error: "That file didn't finish uploading. Try again." };
  }

  const uploaderName =
    profile.full_name ||
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    "Unknown";

  const { data, error } = await admin
    .from("resources_files")
    .insert({
      title,
      category,
      file_path: `${RESOURCES_BUCKET}/${objectPath}`,
      download_enabled: downloadEnabled,
      created_by: profile.id,
      uploader_name: uploaderName,
      uploader_role: profile.role,
    })
    .select("id")
    .single();

  if (error) {
    await admin.storage.from(RESOURCES_BUCKET).remove([objectPath]);
    return { ok: false, error: "Could not save the file." };
  }

  await logAuditEvent({
    action: "resource.upload",
    entity_type: "resource_file",
    entity_id: data?.id ?? null,
    metadata: { title, category, downloadEnabled, size: stored.size },
  });

  revalidatePath("/resources");
  return { ok: true };
}

export async function toggleResourceDownloadAction(formData: FormData) {
  await requireRole(["developer", "admin"]);
  const id = String(formData.get("id") ?? "");
  const downloadEnabled = formData.get("downloadEnabled") === "true";
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("resources_files")
    .update({ download_enabled: downloadEnabled })
    .eq("id", id);

  await logAuditEvent({
    action: "resource.toggle_download",
    entity_type: "resource_file",
    entity_id: id,
    metadata: { downloadEnabled },
  });

  revalidatePath("/resources");
  revalidatePath("/admin");
}

export async function updateResourceAction(formData: FormData) {
  const actor = await requireRole(["developer", "admin"]);
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "training");
  const downloadEnabled = formData.get("downloadEnabled") === "true";
  if (!id || !title) return;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("resources_files")
    .select("id,created_by,uploader_role")
    .eq("id", id)
    .maybeSingle();

  if (!row) return;
  const uploaderRole = (row.uploader_role as typeof actor.role) ?? "analyst";
  const canManage =
    row.created_by === actor.id || isRoleHigher(actor.role, uploaderRole);
  if (!canManage) return;

  await admin
    .from("resources_files")
    .update({ title, category, download_enabled: downloadEnabled })
    .eq("id", id);

  await logAuditEvent({
    action: "resource.update",
    entity_type: "resource_file",
    entity_id: id,
    metadata: { title, category, downloadEnabled },
  });

  revalidatePath("/resources");
  revalidatePath("/admin");
}

export async function deleteResourceAction(formData: FormData) {
  const actor = await requireRole(["developer", "admin"]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("resources_files")
    .select("id,created_by,uploader_role,file_path")
    .eq("id", id)
    .maybeSingle();

  if (!row) return;
  const uploaderRole = (row.uploader_role as typeof actor.role) ?? "analyst";
  const canManage =
    row.created_by === actor.id || isRoleHigher(actor.role, uploaderRole);
  if (!canManage) return;

  if (row.file_path) {
    const { bucket, objectPath } = parseFilePath(row.file_path);
    if (bucket && objectPath) {
      await admin.storage.from(bucket).remove([objectPath]);
    }
  }

  await admin.from("resources_files").delete().eq("id", id);

  await logAuditEvent({
    action: "resource.delete",
    entity_type: "resource_file",
    entity_id: id,
  });

  revalidatePath("/resources");
  revalidatePath("/admin");
}
