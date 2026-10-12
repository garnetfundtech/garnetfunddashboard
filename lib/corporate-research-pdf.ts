import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResearchAttachment } from "@/lib/corporate-research";

/**
 * Fetches the report PDF behind a research email's "PDF" link.
 *
 * Truist sends its research through BlueMatrix. Each email's PDF button is a
 * link such as https://truist.bluematrix.com/links2/track/pdf/<token>?s=1,
 * where the token signs the reader in as the fund, so following it from the
 * server gets the same file a member would get by clicking through "View
 * HTML" and then "PDF". The file goes to the private bucket and is served by
 * /api/corporate-research/attachment like any other attachment: inline, to
 * members only, never as a download link.
 *
 * Only BlueMatrix links are followed. The sender check that picks research
 * emails reads the From header, which anyone can write, so a link's host is
 * checked before the server fetches it.
 */

const BUCKET = "corporate-research";

/**
 * An email's own buttons for its report, best first. Which one answers with
 * the file is not documented — the track link, given a bad token, answers
 * with an image — so each is tried in turn. The HTML view comes last: its
 * page has the PDF button, which download() follows.
 *
 * Plain /docs/pdf/ links are left out here: in an email they are as often
 * links to earlier reports it cites, and following one would file the wrong
 * report under this email.
 */
const EMAIL_LINKS = [
  /\/links2\/track\/pdf\//i,
  /\/links2\/pdf\//i,
  /\/links2\/link\/pdf\//i,
  /\/links2\/html\//i,
];

/** On the report's own web page, any of these is its PDF. */
const PAGE_LINKS = [
  /\/links2\/(?:track\/|link\/)?pdf\//i,
  /\/docs\/pdf\/[^?#]+\.pdf/i,
  /\/sellside\/EmailDocViewer\?.*mime=PDF/i,
];

/** Buttons tried per email, so one email cannot use up a run's time. */
const MAX_LINKS_PER_EMAIL = 3;

const ALLOWED_HOST = /(^|\.)bluematrix\.com$/i;

/** Attempts before an email is given up on (see 0035). */
export const MAX_PDF_ATTEMPTS = 3;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_PDF_BYTES = 40 * 1024 * 1024;

function allowed(url: string) {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && ALLOWED_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

function hrefs(html: string) {
  return [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/gi, "&"));
}

function matching(html: string, patterns: RegExp[]) {
  const links = [...new Set(hrefs(html).filter(allowed))];
  return patterns.flatMap((pattern) => links.filter((l) => pattern.test(l)));
}

/** The email's links that may lead to its report PDF, best first. */
export function findPdfLinks(html: string): string[] {
  return matching(html, EMAIL_LINKS).slice(0, MAX_LINKS_PER_EMAIL);
}

function isPdf(bytes: Uint8Array) {
  // "%PDF", allowing for a few bytes of junk before it, which readers accept.
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

/**
 * The PDF at a link. A link that answers with a web page instead — a viewer
 * that embeds the PDF — is searched for a PDF link once more.
 */
async function download(url: string, depth = 0): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GarnetFundDashboard/1.0",
      Accept: "application/pdf,text/html;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (declared > MAX_PDF_BYTES) throw new Error(`PDF is ${declared} bytes, over the limit`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (isPdf(bytes)) return Buffer.from(bytes);

  const type = res.headers.get("content-type") ?? "unknown type";
  if (depth === 0 && /html/i.test(type)) {
    // Relative links on the page are made absolute before the host check.
    const page = Buffer.from(bytes)
      .toString("utf8")
      .replace(/href\s*=\s*["']([^"']+)["']/gi, (_, href: string) => {
        try {
          return `href="${new URL(href.replace(/&amp;/gi, "&"), res.url)}"`;
        } catch {
          return "";
        }
      });
    const next = matching(page, PAGE_LINKS)[0];
    if (next) return download(next, depth + 1);
  }
  throw new Error(`link gave ${type}, not a PDF`);
}

/** The first of `links` that gives a PDF; the error names what each gave. */
async function firstPdf(links: string[]): Promise<Buffer> {
  const failures: string[] = [];
  for (const link of links) {
    try {
      return await download(link);
    } catch (err) {
      const path = new URL(link).pathname.split("/").slice(0, 3).join("/");
      failures.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(failures.join("; "));
}

function fileName(subject: string) {
  const base = subject.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${base || "Report"}.pdf`;
}

type PdfRow = {
  id: string;
  firm: string;
  subject: string;
  received_at: string;
  attachments: ResearchAttachment[];
  pdf_attempts: number;
};

/**
 * Finds and stores the PDF for one email. Returns the status written: saved,
 * none or failed.
 */
async function savePdf(row: PdfRow): Promise<{ status: "saved" | "none" | "failed"; error?: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("corporate_research_emails")
    .select("html_body")
    .eq("id", row.id)
    .maybeSingle();
  const links = data?.html_body ? findPdfLinks(data.html_body as string) : [];

  if (links.length === 0) {
    await admin.from("corporate_research_emails").update({ pdf_status: "none" }).eq("id", row.id);
    return { status: "none" };
  }

  try {
    const pdf = await firstPdf(links);
    const name = fileName(row.subject);
    const objectPath = `${row.firm}/${row.received_at.slice(0, 10)}/${randomUUID()}-report.pdf`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`upload: ${uploadError.message}`);

    const report: ResearchAttachment = {
      name,
      contentType: "application/pdf",
      size: pdf.length,
      path: `${BUCKET}/${objectPath}`,
      source: "portal",
    };
    // First, so the viewer opens on the report.
    const { error } = await admin
      .from("corporate_research_emails")
      .update({ attachments: [report, ...row.attachments], pdf_status: "saved" })
      .eq("id", row.id);
    if (error) {
      await admin.storage.from(BUCKET).remove([objectPath]);
      throw new Error(error.message);
    }
    return { status: "saved" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("corporate_research_emails")
      .update({ pdf_status: "failed", pdf_attempts: row.pdf_attempts + 1 })
      .eq("id", row.id);
    return { status: "failed", error: message };
  }
}

/**
 * Fetches PDFs for emails that do not have one yet, newest first, until
 * `deadline` (a Date.now() value). Emails left over are picked up next run.
 */
export async function fetchMissingPdfs(deadline: number): Promise<{
  saved: number;
  remaining: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("corporate_research_emails")
    .select("id,firm,subject,received_at,attachments,pdf_attempts")
    .or(`pdf_status.is.null,and(pdf_status.eq.failed,pdf_attempts.lt.${MAX_PDF_ATTEMPTS})`)
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as PdfRow[];
  const errors: string[] = [];
  let saved = 0;
  let done = 0;
  for (const row of rows) {
    if (Date.now() > deadline) break;
    done++;
    const result = await savePdf(row);
    if (result.status === "saved") saved++;
    if (result.error) errors.push(`PDF for "${row.subject}": ${result.error}`);
  }
  return { saved, remaining: rows.length - done, errors };
}
