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
};

export type ResearchEmailSummary = {
  id: string;
  firm: string;
  subject: string;
  from_name: string | null;
  from_address: string | null;
  received_at: string;
  attachments: ResearchAttachment[];
};

export type ResearchEmail = ResearchEmailSummary & {
  html_body: string | null;
  text_body: string | null;
};

const SUMMARY_COLUMNS = "id,firm,subject,from_name,from_address,received_at,attachments";

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
  return (data ?? []) as ResearchEmailSummary[];
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

// An opening tag, allowing ">" inside quoted attribute values.
const LINK_TAG = /<(a|area|base|form)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const LINK_ATTR = /\s(?:href|action|target|ping)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/**
 * The email as members may see it: every link's destination removed.
 *
 * Research emails carry buttons like "View HTML" and "Download PDF" that go
 * to the firm's portal, often with a token that signs the reader in as the
 * fund — a download route the page otherwise withholds. Blocking clicks in
 * the viewer would not be enough, because the URL would still be sitting in
 * the page source, so the addresses are stripped here, on the server, before
 * anything reaches the browser. The link text and styling stay, so the email
 * reads as sent; the buttons simply go nowhere.
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
      html_body: email.html_body.replace(LINK_TAG, (tag) => tag.replace(LINK_ATTR, "")),
      text_body: null,
    };
  }
  return { ...email, text_body: (email.text_body ?? "").replace(URL_TEXT, "[link removed]") };
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
