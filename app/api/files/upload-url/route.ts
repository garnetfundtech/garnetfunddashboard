import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStorageObjectPath, ensureStorageBuckets } from "@/lib/storage";
import { TEAM_FILES_BUCKET, canWriteSector } from "@/lib/team-files";
import { isCoverageTeam } from "@/lib/sectors";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploads";
import { issueUploadGrant } from "@/lib/upload-grant";
import { canAdministerContent } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** The three places a file can land, and the bucket behind each. */
const BUCKETS = {
  team: TEAM_FILES_BUCKET,
  research: "research",
  resources: "resources",
} as const;

type UploadKind = keyof typeof BUCKETS;

/**
 * Step one of any upload: authorize it, and hand back somewhere to put the
 * bytes.
 *
 * The bytes themselves never come here. Vercel caps a function request body
 * at 4.5 MB, so anything larger cannot pass through the server at all — this
 * returns a Supabase signed upload URL and the browser sends the file
 * straight to storage. Step two is the matching record*Action, which turns
 * the uploaded object into a row.
 *
 * Everything that decides *whether* the upload is allowed happens here, while
 * there is still a session to check it against, and the answer is sealed into
 * a grant so step two cannot be talked into something else. The three areas
 * differ only in that authorization rule:
 *
 *   team       your own coverage team, or anywhere for pm/risk_manager/
 *              admin/developer
 *   research   any approved member, filed under a team they pick
 *   resources  content administrators only — these are fund-wide documents
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
  const kind = String(body.kind ?? "team") as UploadKind;
  const filename = String(body.filename ?? "").trim();
  const size = Number(body.size);
  const folderId = String(body.folderId ?? "").trim() || null;
  const requestedSector = String(body.sector ?? "").trim();

  if (!BUCKETS[kind]) {
    return NextResponse.json({ ok: false, message: "Unknown upload type." }, { status: 400 });
  }
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
  let sector = "";

  if (kind === "team") {
    // The folder's own sector wins over anything the client claimed, so a
    // forged field cannot aim a write at a team the uploader can't write to.
    sector = requestedSector;
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
        { ok: false, message: "You can only upload to your own team." },
        { status: 403 },
      );
    }
  }

  if (kind === "research") {
    // Research is open to every approved member — the sector is which team
    // the write-up is filed under, not a permission — but it still has to be
    // a real team, so a bad value can't create a phantom one.
    if (!isCoverageTeam(requestedSector)) {
      return NextResponse.json({ ok: false, message: "Pick a sector." }, { status: 400 });
    }
    sector = requestedSector;
  }

  if (kind === "resources" && !canAdministerContent(profile.role)) {
    return NextResponse.json(
      { ok: false, message: "Only admins and risk managers can upload resources." },
      { status: 403 },
    );
  }

  await ensureStorageBuckets();

  const bucket = BUCKETS[kind];
  const objectPath = buildStorageObjectPath({ name: filename });
  const { data: signed, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);

  if (error || !signed) {
    return NextResponse.json(
      { ok: false, message: "Could not start the upload." },
      { status: 502 },
    );
  }

  const { grant, expiresAt } = issueUploadGrant({
    bucket,
    objectPath,
    sector,
    folderId: kind === "team" ? folderId : null,
  });

  return NextResponse.json({
    ok: true,
    bucket,
    path: signed.path ?? objectPath,
    token: signed.token,
    grant,
    expiresAt,
    // Echoed so a dialog can say where the file is actually landing, which
    // may not be where the client guessed.
    sector,
  });
}
