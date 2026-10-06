"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedProfile, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilePath, statStorageObject } from "@/lib/storage";
import { verifyUploadGrant } from "@/lib/upload-grant";
import { logAuditEvent } from "@/lib/audit";
import { canManageContent, isRoleHigher } from "@/lib/roles";
import { RESOURCE_CATEGORIES, isResourceCategory, type UserRole } from "@/lib/types";

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
  const profile = await requireRole(["risk_manager", "developer", "admin"]);

  const title = String(formData.get("title") ?? "").trim();
  // An unrecognized category would be refused by the enum and take the whole
  // insert down with it, so it falls back rather than reaching the database.
  const requested = formData.get("category");
  const category = isResourceCategory(requested) ? requested : RESOURCE_CATEGORIES[0];
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
    metadata: { title, category, size: stored.size },
  });

  revalidatePath("/resources");
  return { ok: true };
}

export async function updateResourceAction(formData: FormData) {
  const actor = await requireRole(["risk_manager", "developer", "admin"]);
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  // Only written when the form actually sends one. This used to read a
  // missing field as "training", and since the edit form carried no category
  // at all, editing a pitch's title refiled it as training.
  const requested = formData.get("category");
  const category = isResourceCategory(requested) ? requested : null;
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
    .update(category ? { title, category } : { title })
    .eq("id", id);

  await logAuditEvent({
    action: "resource.update",
    entity_type: "resource_file",
    entity_id: id,
    metadata: { title, category: category ?? "unchanged" },
  });

  revalidatePath("/resources");
  revalidatePath("/admin");
}

export async function deleteResourceAction(formData: FormData) {
  const actor = await requireRole(["risk_manager", "developer", "admin"]);
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

// ── Meeting overviews ─────────────────────────────────────────────────────

/** Reads the shared fields of the add and edit forms. */
function meetingFields(formData: FormData):
  | { ok: true; meetingDate: string; title: string; overview: string }
  | { ok: false; error: string } {
  const meetingDate = String(formData.get("meetingDate") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const overview = String(formData.get("overview") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) return { ok: false, error: "Pick the meeting date." };
  if (!title) return { ok: false, error: "Give the meeting a title." };
  if (!overview) return { ok: false, error: "Write the overview." };
  if (title.length > 200) return { ok: false, error: "Keep the title under 200 characters." };
  if (overview.length > 20000) return { ok: false, error: "Keep the overview under 20,000 characters." };
  return { ok: true, meetingDate, title, overview };
}

/** Any approved member can write up a meeting. */
export async function addMeetingOverviewAction(formData: FormData): Promise<ActionResult> {
  const profile = await requireApprovedProfile();
  const fields = meetingFields(formData);
  if (!fields.ok) return fields;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("meeting_overviews")
    .insert({
      meeting_date: fields.meetingDate,
      title: fields.title,
      overview: fields.overview,
      created_by: profile.id,
      author_role: profile.role,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Could not save the overview." };

  await logAuditEvent({
    action: "meeting_overview.create",
    entity_type: "meeting_overview",
    entity_id: data?.id ?? null,
    metadata: { title: fields.title, meeting_date: fields.meetingDate },
  });

  revalidatePath("/resources");
  return { ok: true };
}

/** The author, or anyone senior to the author's role — same rule as files. */
async function loadManageableOverview(id: string) {
  const actor = await requireApprovedProfile();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("meeting_overviews")
    .select("id, created_by, author_role")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  const allowed = canManageContent({
    actorId: actor.id,
    actorRole: actor.role,
    ownerId: (row.created_by as string | null) ?? null,
    ownerRole: (row.author_role as UserRole) ?? "analyst",
  });
  return allowed ? admin : null;
}

export async function updateMeetingOverviewAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing overview." };
  const fields = meetingFields(formData);
  if (!fields.ok) return fields;

  const admin = await loadManageableOverview(id);
  if (!admin) return { ok: false, error: "Only the author or someone senior can edit this overview." };

  const { error } = await admin
    .from("meeting_overviews")
    .update({
      meeting_date: fields.meetingDate,
      title: fields.title,
      overview: fields.overview,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not save the overview." };

  await logAuditEvent({
    action: "meeting_overview.update",
    entity_type: "meeting_overview",
    entity_id: id,
    metadata: { title: fields.title, meeting_date: fields.meetingDate },
  });

  revalidatePath("/resources");
  return { ok: true };
}

export async function deleteMeetingOverviewAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing overview." };
  const admin = await loadManageableOverview(id);
  if (!admin) return { ok: false, error: "Only the author or someone senior can delete this overview." };

  await admin.from("meeting_overviews").delete().eq("id", id);

  await logAuditEvent({
    action: "meeting_overview.delete",
    entity_type: "meeting_overview",
    entity_id: id,
  });

  revalidatePath("/resources");
  return { ok: true };
}
