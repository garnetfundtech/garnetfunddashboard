"use client";

/**
 * The browser half of a direct-to-storage upload.
 *
 * Asks the server whether the upload is allowed and where to put it, then
 * sends the bytes straight to Supabase Storage. What comes back is the grant
 * the caller hands to its own record*Action to create the row — this helper
 * deliberately stops before that step, because the metadata a row needs
 * (title, ticker, category…) differs per area while everything up to the
 * bytes landing is identical.
 *
 * Lives here rather than in each dialog so the three upload surfaces cannot
 * drift apart in how they report failure. That drift is what made the
 * original bug so hard to read: research silently reported success on a
 * refusal, while team files threw an error page.
 */
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_LABEL, checkUploadSize } from "@/lib/uploads";

export type UploadKind = "team" | "research" | "resources";

export type UploadResult =
  | { ok: true; grant: string; sector: string }
  | { ok: false; error: string };

export async function uploadToStorage(params: {
  kind: UploadKind;
  file: File;
  /** Coverage team. Required for research; for team files the server prefers
   *  the folder's own sector and ignores this when a folder is given. */
  sector?: string;
  folderId?: string | null;
}): Promise<UploadResult> {
  const { kind, file, sector, folderId } = params;

  const tooBig = checkUploadSize(file);
  if (tooBig) return { ok: false, error: tooBig };

  const res = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      size: file.size,
      sector: sector ?? "",
      folderId: folderId ?? null,
    }),
  }).catch(() => null);

  if (!res) return { ok: false, error: "Could not reach the server. Check your connection." };

  const json = (await res.json().catch(() => null)) as
    | { ok: true; bucket: string; path: string; token: string; grant: string; sector: string }
    | { ok: false; message?: string }
    | null;

  if (!json) return { ok: false, error: "The server sent back something unreadable." };
  if (!json.ok) return { ok: false, error: json.message ?? "Upload was refused." };

  const supabase = createClient();
  const { error: putError } = await supabase.storage
    .from(json.bucket)
    .uploadToSignedUrl(json.path, json.token, file, {
      contentType: file.type || "application/octet-stream",
    });

  if (putError) {
    // The bucket's own size limit lands here, so say so in those terms rather
    // than repeating the raw storage message.
    return {
      ok: false,
      error: /exceeded the maximum allowed size/i.test(putError.message)
        ? `That file is larger than the ${MAX_UPLOAD_LABEL} limit.`
        : "The file didn't finish uploading. Try again.",
    };
  }

  return { ok: true, grant: json.grant, sector: json.sector };
}
