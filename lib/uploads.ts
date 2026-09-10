/**
 * The upload size limit.
 *
 * One number now, because all three upload surfaces — team files, research
 * and resources — send their bytes straight to Supabase Storage via a signed
 * URL and never through the server. The limit is therefore the buckets' own
 * `file_size_limit`, which Supabase enforces itself on the upload.
 *
 * How this got here: every upload used to ride inside a Server Action
 * request body, which Next caps at 1 MB by default. The team file picker
 * advertised "Up to 20 MB" and the action checked against 20 MB, but neither
 * ever ran for a larger file — the framework rejects an oversized body before
 * application code, so it surfaced as a bare "A server error occurred" page
 * with a reference code and no explanation, for everyone including
 * developers. Nothing over 1 MB had ever reached storage; the largest file in
 * the fund's workspace was 908 KB.
 *
 * Raising Next's `bodySizeLimit` only bought a few megabytes, because Vercel
 * caps a serverless function's request body at 4.5 MB regardless. Going past
 * that meant not sending the bytes through the server at all.
 *
 * To raise this above 20 MB: change `file_size_limit` on the research,
 * resources and team-files buckets (Supabase → Storage → each bucket →
 * Settings), keep this constant in step, and check the project's global
 * upload limit is at least as high. Past roughly 50 MB you also want
 * resumable uploads rather than a single PUT, so a dropped connection
 * doesn't cost the whole transfer.
 *
 * The lesson worth keeping: a limit shown in the UI, a limit checked on the
 * server, and the limit the transport actually enforces have to be the same
 * number, or the gap between them becomes an unexplainable crash.
 */

/** Largest file an upload will accept. Matches `file_size_limit` on the
 *  research, resources and team-files buckets (20971520 bytes each). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Human form of the limit, for picker copy and error messages. */
export const MAX_UPLOAD_LABEL = "20 MB";

/**
 * Checks a file before an upload starts.
 *
 * Run on the client so an oversized file is refused in the dialog, where the
 * message can be read and acted on. The server repeats the check when it
 * signs the URL, and the bucket enforces it a third time on the upload
 * itself — a client is not a trust boundary, and neither is a signed URL
 * handed to one.
 */
export function checkUploadSize(file: { size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) {
    // Rounded up, so a file a byte over the limit doesn't report the limit
    // itself and read as a contradiction.
    const mb = (Math.ceil((file.size / 1024 / 1024) * 10) / 10).toFixed(1);
    return `That file is ${mb} MB. Uploads are limited to ${MAX_UPLOAD_LABEL}.`;
  }
  return null;
}
