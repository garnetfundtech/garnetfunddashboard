import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilePath } from "@/lib/storage";

/**
 * On-demand signed-URL generation for research posts, resource files, and
 * team files. Previously every list page (research, resources, team files)
 * generated view + download URLs for every row up front — for research and
 * resources that was a sequential loop of Storage API calls, so a 40-row
 * list meant up to 80 network round-trips before the page could render at
 * all. Almost none of those URLs were ever used, since a signed URL only
 * matters for the one file someone actually opens.
 *
 * This signs exactly one file, the moment its viewer opens, and nothing
 * else.
 */
const TABLES = {
  research: "research_posts",
  resources: "resources_files",
  "team-files": "team_files",
} as const;

type Source = keyof typeof TABLES;

export async function POST(request: NextRequest) {
  await requireProfile();

  const body = await request.json().catch(() => ({}));
  const source = body.source as Source;
  const id = String(body.id ?? "");
  if (!id || !TABLES[source]) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from(TABLES[source])
    .select("file_path, download_enabled")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.file_path) {
    return NextResponse.json({ ok: false, message: "File not found." }, { status: 404 });
  }

  const { bucket, objectPath } = parseFilePath(row.file_path as string);
  if (!bucket || !objectPath) {
    return NextResponse.json({ ok: false, message: "Invalid file path." }, { status: 404 });
  }

  const [view, dl] = await Promise.all([
    admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10),
    row.download_enabled
      ? admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10, { download: true })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ok: true,
    viewUrl: view.data?.signedUrl ?? null,
    downloadUrl: dl?.data?.signedUrl ?? null,
  });
}
