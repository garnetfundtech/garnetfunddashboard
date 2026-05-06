"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStorageBuckets, buildStorageObjectPath, parseFilePath } from "@/lib/storage";
import { logAuditEvent } from "@/lib/audit";
import { isRoleHigher } from "@/lib/roles";

export async function uploadResearchAction(formData: FormData) {
  const profile = await requireProfile();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const downloadEnabled = formData.get("downloadEnabled") === "true";
  const sector = String(formData.get("sector") ?? "").trim() || null;
  const analystName = String(formData.get("analystName") ?? "").trim() || null;
  const thesisStatus = String(formData.get("thesisStatus") ?? "active").trim() || "active";

  if (!(file instanceof File) || !title) return;

  const authorName =
    analystName ||
    profile.full_name ||
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    "Unknown";

  await ensureStorageBuckets();
  const admin = createAdminClient();
  const objectPath = buildStorageObjectPath(file);
  const fullPath = `research/${objectPath}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await admin.storage.from("research").upload(objectPath, bytes, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });

  await admin.from("research_posts").insert({
    title,
    ticker: ticker || null,
    file_path: fullPath,
    created_by: profile.id,
    author_override: authorName,
    download_enabled: downloadEnabled,
    uploader_role: profile.role,
    sector,
    analyst_name: analystName,
    thesis_status: ["active", "under_review", "became_position", "rejected"].includes(thesisStatus)
      ? thesisStatus
      : "active",
  });

  await logAuditEvent({
    action: "research.upload",
    entity_type: "research_post",
    metadata: { title, ticker, downloadEnabled },
  });

  revalidatePath("/research");
}

export async function updateResearchAction(formData: FormData) {
  const actor = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const downloadEnabled = formData.get("downloadEnabled") === "true";
  const sector = String(formData.get("sector") ?? "").trim() || null;
  const analystName = String(formData.get("analystName") ?? "").trim() || null;
  const thesisStatus = String(formData.get("thesisStatus") ?? "active").trim() || "active";
  if (!id || !title) return;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("research_posts")
    .select("id,created_by,uploader_role,download_enabled")
    .eq("id", id)
    .maybeSingle();

  if (!row) return;
  const uploaderRole = (row.uploader_role as typeof actor.role) ?? "analyst";
  const canManage =
    row.created_by === actor.id || isRoleHigher(actor.role, uploaderRole);
  if (!canManage) return;

  const ts = ["active", "under_review", "became_position", "rejected"].includes(thesisStatus)
    ? thesisStatus
    : "active";

  await admin
    .from("research_posts")
    .update({
      title,
      ticker: ticker || null,
      download_enabled: downloadEnabled,
      sector,
      analyst_name: analystName,
      thesis_status: ts,
    })
    .eq("id", id);

  await logAuditEvent({
    action: "research.update",
    entity_type: "research_post",
    entity_id: id,
    metadata: { title, ticker, downloadEnabled, sector, thesisStatus: ts },
  });

  revalidatePath("/research");
}

export async function deleteResearchAction(formData: FormData) {
  const actor = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("research_posts")
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

  await admin.from("research_posts").delete().eq("id", id);

  await logAuditEvent({
    action: "research.delete",
    entity_type: "research_post",
    entity_id: id,
  });

  revalidatePath("/research");
}
