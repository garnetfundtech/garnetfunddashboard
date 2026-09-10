/**
 * The signed permission slip that ties a direct-to-storage upload back to the
 * authorization that allowed it.
 *
 * Large uploads no longer travel through a Server Action — the browser sends
 * the bytes straight to Supabase Storage via a signed upload URL, because
 * Vercel caps a function request body at 4.5 MB and no amount of config gets
 * past that (see lib/uploads.ts). That splits one operation into two
 * requests: "may I upload, and where" and then "here is the row for the file
 * I just uploaded".
 *
 * The second request is the dangerous one. Left unprotected, a client could
 * call it with any object path and any team, and record a row claiming a file
 * belongs to a sector they cannot write to. So the first request returns this
 * grant — an HMAC over the exact path, sector and folder the server itself
 * authorized — and the second refuses to act without it. The client cannot
 * mint one and cannot alter the values inside one.
 *
 * Stateless on purpose: no pending-upload table to reconcile, and nothing to
 * clean up when someone abandons the dialog. The expiry is what bounds it.
 */
import { createHmac, timingSafeEqual } from "crypto";

/** How long a grant stays usable. Long enough to push 20 MB on bad hotel
 *  wifi, short enough that a leaked one is worthless by the time it is read. */
const GRANT_TTL_MS = 30 * 60 * 1000;

export type UploadGrant = {
  /** Storage bucket the object was signed into. Part of the signature so a
   *  grant for one area cannot be replayed to record a row in another. */
  bucket: string;
  objectPath: string;
  /** Coverage team for a team file or research post; empty for resources,
   *  which are fund-wide. */
  sector: string;
  folderId: string | null;
  expiresAt: number;
};

/**
 * The HMAC key.
 *
 * The service role key is already the app's most privileged server-only
 * secret and is guaranteed present wherever this runs, so it doubles as the
 * signing key rather than introducing another variable that could be unset in
 * one environment and silently disable signing. It is never sent to a client
 * and never appears in a grant — only the digest does.
 */
function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign uploads.");
  return key;
}

/** Canonical string form. Field order is fixed, and the separator cannot
 *  appear in a UUID-based path, a sector name or a UUID folder id. */
function payload(grant: UploadGrant): string {
  return [
    grant.bucket,
    grant.objectPath,
    grant.sector,
    grant.folderId ?? "",
    String(grant.expiresAt),
  ].join("\n");
}

function digest(grant: UploadGrant): string {
  return createHmac("sha256", signingKey()).update(payload(grant)).digest("base64url");
}

/** Issues a grant for an upload the caller has already authorized. */
export function issueUploadGrant(params: {
  bucket: string;
  objectPath: string;
  sector: string;
  folderId: string | null;
}): { grant: string; expiresAt: number } {
  const grant: UploadGrant = { ...params, expiresAt: Date.now() + GRANT_TTL_MS };
  // The values travel in the clear alongside their digest. They are not
  // secret — the point is that they cannot be changed, not that they cannot
  // be read.
  const body = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return { grant: `${body}.${digest(grant)}`, expiresAt: grant.expiresAt };
}

/**
 * Verifies a grant and returns what the server originally authorized, or null
 * if it was forged, altered, or has expired. Callers must use the returned
 * values rather than anything the client sent alongside them.
 */
export function verifyUploadGrant(token: string): UploadGrant | null {
  const [body, provided] = token.split(".");
  if (!body || !provided) return null;

  let grant: UploadGrant;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof parsed?.bucket !== "string" ||
      typeof parsed?.objectPath !== "string" ||
      typeof parsed?.sector !== "string" ||
      typeof parsed?.expiresAt !== "number" ||
      (parsed.folderId !== null && typeof parsed.folderId !== "string")
    ) {
      return null;
    }
    grant = parsed as UploadGrant;
  } catch {
    return null;
  }

  const expected = digest(grant);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  // Compare lengths first: timingSafeEqual throws on a mismatch rather than
  // returning false, which would surface as a 500 instead of a refusal.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() > grant.expiresAt) return null;

  return grant;
}
