import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStorageObjectPath, ensureStorageBuckets } from "@/lib/storage";
import { TEAM_FILES_BUCKET, canWriteSector } from "@/lib/team-files";
import { isCoverageTeam } from "@/lib/sectors";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploads";
import { issueUploadGrant } from "@/lib/upload-grant";

export const dynamic = "force-dynamic";

/**
 * Step one of a team file upload: authorize it, and hand back somewhere to
 * put the bytes.
 *
 * The bytes themselves never come here. Vercel caps a function request body
 * at 4.5 MB, so a 20 MB upload cannot pass through the server at all — this
 * returns a Supabase signed upload URL and the browser sends the file
 * straight to storage. Step two is recordTeamFileAction, which turns the
 * uploaded object into a row.
 *
 * Everything that decides *whether* the upload is allowed happens here, while
 * there is still a session to check it against, and the answer is sealed into
 * a grant so step two cannot be talked into something else.
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (profile.status !== "approved") {
    return NextResponse.json(
      { ok: false, message: "Your account is still pending approval." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const filename = String(body.filename ?? "").trim();
  const size = Number(body.size);
  const contentType = String(body.contentType ?? "").trim();
  const folderId = String(body.folderId ?? "").trim() || null;
  const requestedSector = String(body.sector ?? "").trim();

  if (!filename) {
    return NextResponse.json({ ok: false, message: "A filename is required." }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ ok: false, message: "That file is empty." }, { status: 400 });
  }
  // Advisory only — the real enforcement is the bucket's own file_size_limit,
  // which Supabase applies to the upload itself. This just fails fast and
  // gives a reason instead of letting someone push 20 MB to be refused at the
  // end of it.
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, message: `Files must be ${MAX_UPLOAD_LABEL} or smaller.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // The folder's own sector wins over anything the client claimed, so a
  // forged field cannot aim a write at a team the uploader can't write to.
  let sector = requestedSector;
  if (folderId) {
    const { data } = await admin
      .from("team_folders")
      .select("sector")
      .eq("id", folderId)
      .maybeSingle();
    const found = (data as { sector: string } | null)?.sector ?? null;
    if (!found) {
      return NextResponse.json({ ok: false, message: "Folder not found." }, { status: 404 });
    }
    sector = found;
  }

  if (!sector || !isCoverageTeam(sector)) {
    return NextResponse.json({ ok: false, message: "Unknown team." }, { status: 400 });
  }
  if (!canWriteSector(profile, sector)) {
    return NextResponse.json(
      { ok: false, message: `You can only upload to your own team.` },
      { status: 403 },
    );
  }

  await ensureStorageBuckets();

  const objectPath = buildStorageObjectPath({ name: filename });
  const { data: signed, error } = await admin.storage
    .from(TEAM_FILES_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error || !signed) {
    return NextResponse.json(
      { ok: false, message: "Could not start the upload." },
      { status: 502 },
    );
  }

  const { grant, expiresAt } = issueUploadGrant({ objectPath, sector, folderId });

  return NextResponse.json({
    ok: true,
    bucket: TEAM_FILES_BUCKET,
    path: signed.path ?? objectPath,
    token: signed.token,
    grant,
    expiresAt,
    // Echoed so the dialog can say which team the file is actually landing
    // in, which may not be the one the client guessed.
    sector,
    contentType: contentType || "application/octet-stream",
  });
}
