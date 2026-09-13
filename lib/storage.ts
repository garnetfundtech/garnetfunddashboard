import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

const REQUIRED_BUCKETS = ["research", "resources", "team-files"] as const;

/**
 * Creates the three buckets if they're missing, and makes sure none of them
 * restricts what can be uploaded.
 *
 * All three areas take any file type — models (.xlsx/.xlsm), memos, decks,
 * recordings, archives, PDFs — so none of them may carry an
 * `allowed_mime_types` list. A bucket configured with one refuses the upload
 * inside Supabase, after the browser has already pushed the bytes, and the
 * only thing the user sees is a failed transfer at the end of it. Clearing it
 * here keeps the bucket in step with what the pickers promise, including on a
 * project where someone set the restriction by hand in the dashboard.
 *
 * The clear only fires when a restriction is actually present, so the common
 * path stays at the one listBuckets call it always was.
 */
export async function ensureStorageBuckets() {
  const admin = createAdminClient();
  const { data: existingBuckets, error } = await admin.storage.listBuckets();

  if (error) return;

  for (const bucket of REQUIRED_BUCKETS) {
    const existing = existingBuckets.find((entry) => entry.name === bucket);
    if (!existing) {
      await admin.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: MAX_UPLOAD_BYTES,
        // Explicit rather than implied: any type is a decision, not an
        // oversight.
        allowedMimeTypes: null,
      });
      continue;
    }

    if ((existing.allowed_mime_types ?? []).length > 0) {
      // `public` is required by updateBucket, so echo the bucket's own value
      // back rather than asserting one — these are private and must stay so.
      await admin.storage.updateBucket(bucket, {
        public: existing.public,
        allowedMimeTypes: null,
      });
    }
  }
}

/** Takes anything with a name, so a caller that only knows the filename (the
 *  signed-upload route, which never receives the File itself) can use it. */
export function buildStorageObjectPath(file: { name: string }) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
}

export function parseFilePath(path: string) {
  const [bucket, ...parts] = path.split("/");
  return { bucket, objectPath: parts.join("/") };
}

/**
 * Reads back a stored object's real size and type.
 *
 * Used by every record*Action after a direct-to-storage upload: the client
 * could otherwise claim a row for a file it never finished sending, or
 * understate the size of one it did. Returns null when the object is not
 * there, which is the "upload didn't complete" case.
 */
export async function statStorageObject(bucket: string, objectPath: string) {
  const admin = createAdminClient();
  const lastSlash = objectPath.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : objectPath.slice(0, lastSlash);
  const name = objectPath.slice(lastSlash + 1);

  const { data } = await admin.storage.from(bucket).list(dir, { search: name, limit: 1 });
  const found = (data ?? []).find((entry) => entry.name === name);
  if (!found) return null;

  const meta = (found.metadata ?? {}) as { size?: number; mimetype?: string };
  return { size: Number(meta.size ?? 0), mimeType: meta.mimetype || null };
}
