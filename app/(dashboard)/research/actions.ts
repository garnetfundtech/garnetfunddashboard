"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilePath, statStorageObject } from "@/lib/storage";
import { logAuditEvent } from "@/lib/audit";
import { isRoleHigher } from "@/lib/roles";
import { verifyUploadGrant } from "@/lib/upload-grant";
import { isCoverageTeam } from "@/lib/sectors";

/** Bucket research PDFs live in. */
const RESEARCH_BUCKET = "research";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Records a research post whose PDF is already in storage.
 *
 * Research used to send its bytes through this action, which capped it at
 * whatever a Server Action body allows — 1 MB by default, and never more
 * than Vercel's 4.5 MB. Write-ups routinely exceed that, and the rejection
 * happened before this code ran, so it surfaced as an error page. The file
 * now goes straight to Supabase Storage and only this small payload comes
 * back through the server. See lib/uploads.ts.
 *
 * The sector is taken from the signed grant rather than the form, and the
 * file's size and type are read back off the stored object, so the only
 * client-supplied values that survive are the write-up's own metadata.
 */
export async function recordResearchAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();

  const title = String(formData.get("title") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const companyName = String(formData.get("companyName") ?? "").trim() || null;
  const analystName = String(formData.get("analystName") ?? "").trim();
  const downloadEnabled = formData.get("downloadEnabled") === "true";
  const grantToken = String(formData.get("grant") ?? "");

  if (!title) return { ok: false, error: "A report title is required." };
  if (!analystName) return { ok: false, error: "An analyst name is required." };

  const grant = verifyUploadGrant(grantToken);
  if (!grant) {
    return {
      ok: false,
      error: "That upload expired before it was saved. Try uploading again.",
    };
  }
  if (grant.bucket !== RESEARCH_BUCKET) {
    return { ok: false, error: "That upload wasn't for research." };
  }

  const { objectPath, sector } = grant;
  if (!isCoverageTeam(sector)) {
    return { ok: false, error: "Pick a sector." };
  }

  const admin = createAdminClient();

  const stored = await statStorageObject(RESEARCH_BUCKET, objectPath);
  if (!stored) {
    return { ok: false, error: "That file didn't finish uploading. Try again." };
  }

  const authorName =
    analystName ||
    profile.full_name ||
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    "Unknown";

  const { error } = await admin.from("research_posts").insert({
    title,
    ticker: ticker || null,
    company_name: companyName,
    file_path: `${RESEARCH_BUCKET}/${objectPath}`,
    created_by: profile.id,
    author_override: authorName,
    download_enabled: downloadEnabled,
    uploader_role: profile.role,
    sector,
    analyst_name: analystName,
    thesis_status: "active",
  });

  if (error) {
    // Don't leave the object behind if the row never landed.
    await admin.storage.from(RESEARCH_BUCKET).remove([objectPath]);
    return { ok: false, error: "Could not save the report." };
  }

  await logAuditEvent({
    action: "research.upload",
    entity_type: "research_post",
    metadata: { title, ticker, downloadEnabled, size: stored.size },
  });

  revalidatePath("/research");
  return { ok: true };
}

export async function updateResearchAction(formData: FormData) {
  const actor = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const downloadEnabled = formData.get("downloadEnabled") === "true";
  const sector = String(formData.get("sector") ?? "").trim() || null;
  const analystName = String(formData.get("analystName") ?? "").trim() || null;
  const companyName = String(formData.get("companyName") ?? "").trim() || null;
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

  await admin
    .from("research_posts")
    .update({
      title,
      ticker: ticker || null,
      company_name: companyName,
      download_enabled: downloadEnabled,
      sector,
      analyst_name: analystName,
    })
    .eq("id", id);

  await logAuditEvent({
    action: "research.update",
    entity_type: "research_post",
    entity_id: id,
    metadata: { title, ticker, downloadEnabled, sector },
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
