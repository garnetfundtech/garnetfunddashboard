import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const REQUIRED_BUCKETS = ["research", "resources"] as const;

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

export function buildStorageObjectPath(file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
}

export function parseFilePath(path: string) {
  const [bucket, ...parts] = path.split("/");
  return { bucket, objectPath: parts.join("/") };
}
