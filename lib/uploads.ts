/**
 * Upload size limits, one per transport.
 *
 * There are two, because the app now has two ways to get a file into storage
 * and they have very different ceilings:
 *
 *   Direct to storage (team files) — the browser asks the server for a signed
 *     upload URL and sends the bytes straight to Supabase. Nothing large
 *     passes through Vercel, so the only limit is the bucket's own, which is
 *     provisioned at 20 MB and enforced by Supabase itself.
 *
 *   Through a Server Action (research) — the bytes ride inside the request
 *     body to a serverless function. Next caps that at 1 MB by default and
 *     Vercel caps it at 4.5 MB regardless of what Next is told, so 4 MB is
 *     the honest maximum here.
 *
 * Why any of this exists: the team file picker used to advertise 20 MB while
 * every upload went through a Server Action with the stock 1 MB cap. Nothing
 * over 1 MB had ever reached storage — the largest file in the fund's
 * workspace was 908 KB — and because the framework rejects an oversized body
 * before application code runs, it surfaced as a bare "A server error
 * occurred" page with a reference code and no explanation, for everyone
 * including developers.
 *
 * The lesson encoded here: a limit shown in the UI, a limit checked on the
 * server, and the limit the transport actually enforces have to be the same
 * number, or the gap between them becomes an unexplainable crash.
 */

/** Ceiling for uploads that go straight to Supabase Storage. Matches the
 *  `file_size_limit` on the research / resources / team-files buckets; the
 *  storage API refuses anything larger on its own. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Ceiling for uploads that ride inside a Server Action request body. Bounded
 *  by Vercel's 4.5 MB function body limit, not by us — keep in step with
 *  `experimental.serverActions.bodySizeLimit` in next.config.ts. */
export const MAX_ACTION_UPLOAD_BYTES = 4 * 1024 * 1024;

export const MAX_UPLOAD_LABEL = "20 MB";
export const MAX_ACTION_UPLOAD_LABEL = "4 MB";

function tooBig(size: number, limit: number, label: string): string {
  // Rounded up, so a file a byte over the limit doesn't report the limit
  // itself and read as a contradiction.
  const mb = (Math.ceil((size / 1024 / 1024) * 10) / 10).toFixed(1);
  return `That file is ${mb} MB. Uploads are limited to ${label}.`;
}

/**
 * Checks a file bound for direct storage upload (team files).
 *
 * Run on the client so an oversized file is refused in the dialog, where the
 * message can be read, and again on the server because a client is not a
 * trust boundary.
 */
export function checkUploadSize(file: { size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return tooBig(file.size, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL);
  }
  return null;
}

/**
 * Checks a file bound for a Server Action (research).
 *
 * The stricter of the two. Over this limit the framework rejects the request
 * before the action runs, so catching it here is the difference between a
 * sentence the uploader can act on and an error page.
 */
export function checkActionUploadSize(file: { size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_ACTION_UPLOAD_BYTES) {
    return `${tooBig(file.size, MAX_ACTION_UPLOAD_BYTES, MAX_ACTION_UPLOAD_LABEL)} Compress it, or upload it to your team workspace instead, which accepts up to ${MAX_UPLOAD_LABEL}.`;
  }
  return null;
}
