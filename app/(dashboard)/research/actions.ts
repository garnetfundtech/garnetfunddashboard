"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStorageBuckets, buildStorageObjectPath } from "@/lib/storage";
import { logAuditEvent } from "@/lib/audit";

export async function uploadResearchAction(formData: FormData) {
  const profile = await requireProfile();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const downloadEnabled = formData.get("downloadEnabled") === "true";

  if (!(file instanceof File) || !title) return;

  const authorName =
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
  });

  await logAuditEvent({
    action: "research.upload",
    entity_type: "research_post",
    metadata: { title, ticker, downloadEnabled },
  });

  revalidatePath("/research");
}
