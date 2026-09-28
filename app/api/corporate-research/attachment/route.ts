import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireSessionUser } from "@/lib/require-session";
import { getResearchEmail } from "@/lib/corporate-research";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFilePath } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Streams one attachment of a Corporate Research email for the in-page viewer.
 *
 * Proxied rather than signed. The other file areas hand the browser a signed
 * Storage URL, which is a working download link for ten minutes to anyone it
 * is pasted to; this research is licensed to the fund, so the bytes only ever
 * come from here, to a member's session, marked inline and uncacheable.
 *
 * That removes the download button and the shareable link. It cannot stop a
 * member who is determined to keep a copy — nothing a browser renders can —
 * and the page does not pretend otherwise.
 */
export async function GET(request: NextRequest) {
  const session = await requireSessionUser();
  if (session.response) return session.response;
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "approved") {
    return NextResponse.json({ ok: false, message: "Members only." }, { status: 403 });
  }

  const emailId = request.nextUrl.searchParams.get("email") ?? "";
  const index = Number(request.nextUrl.searchParams.get("n"));
  const email = await getResearchEmail(emailId);
  const attachment = Number.isInteger(index) ? email?.attachments[index] : undefined;
  if (!attachment) {
    return NextResponse.json({ ok: false, message: "Attachment not found." }, { status: 404 });
  }

  const { bucket, objectPath } = parseFilePath(attachment.path);
  const { data, error } = await createAdminClient().storage.from(bucket).download(objectPath);
  if (error || !data) {
    return NextResponse.json({ ok: false, message: "Attachment not found." }, { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
