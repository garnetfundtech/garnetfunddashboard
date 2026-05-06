"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStorageBuckets, buildStorageObjectPath, parseFilePath } from "@/lib/storage";
import { logAuditEvent } from "@/lib/audit";
import { isRoleHigher } from "@/lib/roles";

export async function uploadResourceAction(formData: FormData) {
  const profile = await requireRole(["developer", "admin"]);
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "training");
  const downloadEnabled = formData.get("downloadEnabled") === "on";
  const uploaderName =
    (profile as { full_name?: string; first_name?: string; last_name?: string }).full_name ||
    `${(profile as { first_name?: string }).first_name ?? ""} ${(profile as { last_name?: string }).last_name ?? ""}`.trim() ||
    "Unknown";

  if (!(file instanceof File) || !title) return;

  await ensureStorageBuckets();
  const admin = createAdminClient();
  const objectPath = buildStorageObjectPath(file);
  const fullPath = `resources/${objectPath}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await admin.storage.from("resources").upload(objectPath, bytes, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });

  const { data } = await admin
    .from("resources_files")
    .insert({
      title,
      category,
      file_path: fullPath,
      download_enabled: downloadEnabled,
      created_by: profile.id,
      uploader_name: uploaderName,
      uploader_role: profile.role,
    })
    .select("id")
    .single();

  await logAuditEvent({
    action: "resource.upload",
    entity_type: "resource_file",
    entity_id: data?.id ?? null,
    metadata: { title, category, downloadEnabled },
  });

  revalidatePath("/resources");
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
