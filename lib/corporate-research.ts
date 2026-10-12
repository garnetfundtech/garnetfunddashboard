import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The firms whose research is imported into the Corporate Research tab.
 *
 * Each firm gets its own sub-tab. An email belongs to a firm when any of its
 * `match` words appears in the From header — the display name or the address
 * — case-insensitively. Matching the whole header rather than the domain
 * alone is deliberate: sell-side research is often sent through a
 * distribution platform, so the address can be a vendor's while the name
 * still reads "Truist Securities".
 *
 * Adding BofA is one entry here, e.g.
 *   { slug: "bofa", label: "BofA", match: ["bofa", "bankofamerica", "bofasecurities"] },
 * with no migration and no other code change.
 */
export const RESEARCH_FIRMS = [
  { slug: "truist", label: "Truist", match: ["truist"] },
] as const satisfies readonly ResearchFirm[];

export type ResearchFirm = { slug: string; label: string; match: readonly string[] };
export type ResearchFirmSlug = (typeof RESEARCH_FIRMS)[number]["slug"];

export function findFirm(slug: string | undefined): ResearchFirm | null {
  return RESEARCH_FIRMS.find((f) => f.slug === slug) ?? null;
}

/** The firm an email's From header belongs to, or null if it is none of them. */
export function firmForSender(fromName: string | null, fromAddress: string | null): ResearchFirm | null {
  const header = `${fromName ?? ""} ${fromAddress ?? ""}`.toLowerCase();
  return RESEARCH_FIRMS.find((f) => f.match.some((word) => header.includes(word))) ?? null;
}

export type ResearchAttachment = {
  name: string;
  contentType: string;
  size: number;
  /** bucket/objectPath, the same shape lib/storage.ts parseFilePath reads. */
  path: string;
  /** "portal": the report PDF fetched from the firm's link, not sent with the email. See 0035. */
  source?: "portal";
};

export type ResearchEmailSummary = {
  id: string;
  firm: string;
  subject: string;
  from_name: string | null;
  from_address: string | null;
  received_at: string;
  attachments: ResearchAttachment[];
  /** null: not read yet. "": read, no coverage label found. See 0034. */
  sector: string | null;
  industry: string | null;
};

export type ResearchEmail = ResearchEmailSummary & {
  html_body: string | null;
  text_body: string | null;
};

const SUMMARY_COLUMNS =
  "id,firm,subject,from_name,from_address,received_at,attachments,sector,industry";

/** The list for one firm, newest first. Bodies are left out; only the open email needs one. */
export async function listResearchEmails(firm: string, limit = 500): Promise<ResearchEmailSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("corporate_research_emails")
    .select(SUMMARY_COLUMNS)
    .eq("firm", firm)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const emails = (data ?? []) as ResearchEmailSummary[];
  await fillSectors(emails.filter((e) => e.sector == null));
  return emails;
}

/**
 * Coverage sectors, as the label above a research email's buttons names
 * them. Each entry is [tab name, ...spellings]; spellings are matched at the
 * start of the label, longest first, so "Consumer Staples" wins over
 * "Consumer". GICS names plus the shorter forms sell-side desks use.
 */
const SECTORS: readonly (readonly string[])[] = [
  ["Communication Services", "communication services", "communications", "telecommunications", "telecom", "media"],
  ["Consumer Discretionary", "consumer discretionary"],
  ["Consumer Staples", "consumer staples"],
  ["Consumer", "consumer"],
  ["Energy", "energy"],
  ["Financials", "financials", "financial services", "financial"],
  ["Health Care", "health care", "healthcare"],
  ["Industrials", "industrials", "industrial"],
  ["Technology", "information technology", "technology"],
  ["Materials", "basic materials", "materials"],
  ["Real Estate", "real estate", "reits", "reit"],
  ["Utilities", "utilities"],
];

const SECTOR_SPELLINGS = SECTORS.flatMap(([name, ...spellings]) =>
  spellings.map((spelling) => ({ name, spelling })),
).sort((a, b) => b.spelling.length - a.spelling.length);

/** Where the header ends: the label sits above these buttons. */
const HEADER_END = /\b(?:view html|view pdf|download pdf|read more|full report)\b/i;

/** How far down to look when an email has no such button. */
const HEADER_LINES = 25;

type SectorLabel = { sector: string; industry: string | null };

const NO_LABEL: SectorLabel = { sector: "", industry: null };

function htmlToText(html: string) {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(?:br|p|div|tr|td|th|li|h[1-6]|table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function labelInText(text: string): SectorLabel | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const end = lines.findIndex((l) => HEADER_END.test(l));
  for (const line of lines.slice(0, end === -1 ? HEADER_LINES : end)) {
    // A label, not a sentence that happens to start with "Energy".
    if (line.length > 80 || /[.!?]$/.test(line)) continue;
    const lower = line.toLowerCase();
    const hit = SECTOR_SPELLINGS.find(
      ({ spelling }) => lower.startsWith(spelling) && !/[a-z]/.test(lower[spelling.length] ?? ""),
    );
    if (!hit) continue;
    const industry = line.slice(hit.spelling.length).replace(/^[\s|/:,·•–—-]+/, "").trim();
    return { sector: hit.name, industry: industry || null };
  }
  return null;
}

/**
 * The coverage label of a research email — "Industrials Machinery" becomes
 * { sector: "Industrials", industry: "Machinery" }. Sector is "" when the
 * email has none (a macro note, say), which lists it under "Other".
 */
export function sectorFromBody(text: string | null, html: string | null): SectorLabel {
  return (
    (text ? labelInText(text) : null) ?? (html ? labelInText(htmlToText(html)) : null) ?? NO_LABEL
  );
}

/**
 * HTML bodies read per page load while filling labels. They carry their
 * charts inline and can run to megabytes; anything past this is left for the
 * next load.
 */
const HTML_READS_PER_LOAD = 20;

/**
 * Reads and saves the label of emails stored before 0034, so this happens
 * once per email. The text body is tried first because it is small; the HTML
 * only for an email whose text has no label.
 */
async function fillSectors(emails: ResearchEmailSummary[]) {
  if (emails.length === 0) return;
  const admin = createAdminClient();
  const byId = new Map(emails.map((e) => [e.id, e]));

  for (let i = 0; i < emails.length; i += 50) {
    const { data, error } = await admin
      .from("corporate_research_emails")
      .select("id,text_body")
      .in("id", emails.slice(i, i + 50).map((e) => e.id));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const found = row.text_body ? labelInText(row.text_body as string) : null;
      if (found) Object.assign(byId.get(row.id as string)!, found);
    }
  }

  for (const email of emails.filter((e) => e.sector == null).slice(0, HTML_READS_PER_LOAD)) {
    const { data } = await admin
      .from("corporate_research_emails")
      .select("html_body")
      .eq("id", email.id)
      .maybeSingle();
    const html = (data?.html_body as string | null) ?? null;
    Object.assign(email, (html ? labelInText(htmlToText(html)) : null) ?? NO_LABEL);
  }

  // One update per distinct label rather than one per email.
  const groups = new Map<string, string[]>();
  for (const e of emails) {
    if (e.sector == null) continue;
    const key = JSON.stringify([e.sector, e.industry]);
    groups.set(key, [...(groups.get(key) ?? []), e.id]);
  }
  for (const [key, ids] of groups) {
    const [sector, industry] = JSON.parse(key) as [string, string | null];
    await admin.from("corporate_research_emails").update({ sector, industry }).in("id", ids);
  }
}

export async function getResearchEmail(id: string): Promise<ResearchEmail | null> {
  // A malformed id is a bad link, not a server error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("corporate_research_emails")
    .select(`${SUMMARY_COLUMNS},html_body,text_body`)
    .eq("id", id)
    .maybeSingle();
  return (data as ResearchEmail | null) ?? null;
}

/**
 * Link attributes, on any tag. Outlook-targeted emails put their buttons in
 * VML (<v:roundrect href=...>), and SVG uses xlink:href, so this is not
 * limited to <a>.
 */
const LINK_ATTR =
  /\s(?:xlink:)?(?:href|action|formaction|target|ping)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * A web address written out as text. Three shapes: anything with a scheme,
 * anything starting www., and a bare host with a path such as
 * research.truist.com/reports — the last needs the path so that a firm name
 * in a sentence ("Truist.com") or an email address is left alone.
 */
const URL_TEXT =
  /\b(?:https?:\/\/|www\.)[^\s<>"']+|(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|us|info|biz)\/[^\s<>"']*/gi;

/** Sentence punctuation that ends up glued to the end of a written-out address. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/**
 * Walks HTML one piece at a time: a comment, a <style> or <script> block, a
 * tag, or text.
 *
 *   comments  dropped. Nothing renders them, and Outlook-only markup — often
 *             a second copy of the "View" button — hides inside them.
 *   <script>  dropped. The sandbox would never run it anyway.
 *   <style>   kept as is; its url(...) values are backgrounds and fonts.
 *   tags      link attributes removed, except on <link>, whose href is a
 *             stylesheet. Image src is untouched so charts still show.
 *   text      written-out addresses replaced with "[link removed]".
 */
const HTML_PIECE =
  /<!--[\s\S]*?(?:-->|$)|<(style|script)\b[\s\S]*?(?:<\/\1\s*>|$)|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</gi;

function stripUrls(text: string) {
  return text.replace(URL_TEXT, (url) => {
    const trailing = url.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    return `[link removed]${trailing}`;
  });
}

function stripHtmlLinks(html: string) {
  return html.replace(HTML_PIECE, (piece, block: string | undefined) => {
    if (piece.startsWith("<!--")) return "";
    if (block) return block.toLowerCase() === "script" ? "" : piece;
    if (piece.length > 1 && piece.startsWith("<")) {
      return /^<link\b/i.test(piece) ? piece : piece.replace(LINK_ATTR, "");
    }
    return stripUrls(piece);
  });
}

/**
 * The email as members may see it: every link's destination removed.
 *
 * Research emails carry buttons like "View HTML" and "Download PDF" that go
 * to the firm's portal, often with a token that signs the reader in as the
 * fund — a download route the page otherwise withholds. Blocking clicks in
 * the viewer would not be enough, because the URL would still be sitting in
 * the page source, so the addresses are stripped here, on the server, before
 * anything reaches the browser. The link text and styling stay, so the email
 * reads as sent; the buttons simply go nowhere. Addresses written out in the
 * text itself — the disclosures print one — are replaced with
 * "[link removed]".
 *
 * Applied at display time, not at import, so the stored email is untouched
 * and this can be loosened later without re-importing. Only the body the
 * viewer shows is returned: a plain-text alternative would carry the same
 * URLs written out.
 */
export function withoutLinks(email: ResearchEmail): ResearchEmail {
  if (email.html_body) {
    return {
      ...email,
      html_body: stripHtmlLinks(email.html_body),
      text_body: null,
    };
  }
  return { ...email, text_body: stripUrls(email.text_body ?? "") };
}

/** When the newest stored email arrived — where the next import picks up from. */
export async function latestResearchEmailAt(): Promise<Date | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("corporate_research_emails")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.received_at ? new Date(data.received_at as string) : null;
}
