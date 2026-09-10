import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const REQUIRED_BUCKETS = ["research", "resources", "team-files"] as const;

export async function ensureStorageBuckets() {
  const admin = createAdminClient();
  const { data: existingBuckets, error } = await admin.storage.listBuckets();

  if (error) return;

  for (const bucket of REQUIRED_BUCKETS) {
    const exists = existingBuckets.some((entry) => entry.name === bucket);
    if (!exists) {
      await admin.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 20 * 1024 * 1024,
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
