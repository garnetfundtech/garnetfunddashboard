import { randomUUID } from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RESEARCH_FIRMS,
  firmForSender,
  latestResearchEmailAt,
  type ResearchAttachment,
} from "@/lib/corporate-research";

/**
 * Imports sell-side research emails from the fund's Gmail inbox.
 *
 * Logs in over IMAP with a Gmail app password (RESEARCH_INBOX_USER /
 * RESEARCH_INBOX_APP_PASSWORD), searches for mail from each firm in
 * RESEARCH_FIRMS, and stores every email not already stored as one row of
 * corporate_research_emails. Nothing in the inbox is changed — no message is
 * marked read, moved or deleted — so the mailbox stays usable by a person.
 *
 * Safe to run as often as you like: an email is keyed on its Message-ID, so a
 * second run over the same window finds nothing new.
 */

const BUCKET = "corporate-research";

/** How far back the very first run reaches, when nothing is stored yet. */
const FIRST_RUN_LOOKBACK_DAYS = 90;

/**
 * Later runs start this far before the newest stored email. IMAP SINCE is
 * date-only and in the server's timezone, and mail can land late, so a small
 * overlap costs one cheap duplicate check and never misses a day.
 */
const OVERLAP_DAYS = 3;

/**
 * Emails downloaded per run. Each is a full MIME download plus storage
 * uploads, and the function has a time limit; whatever is left over is picked
 * up by the next run, oldest first, so nothing is skipped.
 */
const MAX_PER_RUN = 40;

/**
 * Stop starting new downloads after this long. The route's maxDuration is
 * 60s and Vercel kills the function outright at that point, which the button
 * can only report as a failure; 40 emails heavy with inline charts were
 * enough to hit it. Stopping early instead returns a normal result, and the
 * emails not reached count as `remaining` for the next run.
 */
const TIME_BUDGET_MS = 40_000;

export type SyncResult = {
  mailbox: string;
  since: string;
  found: number;
  imported: number;
  remaining: number;
  errors: string[];
};

export function isResearchInboxConfigured() {
  return Boolean(
    process.env.RESEARCH_INBOX_USER?.trim() && process.env.RESEARCH_INBOX_APP_PASSWORD?.trim(),
  );
}

export async function syncResearchInbox(): Promise<SyncResult> {
  const user = process.env.RESEARCH_INBOX_USER?.trim();
  // Google shows app passwords in groups of four with spaces; accept it pasted either way.
  const pass = process.env.RESEARCH_INBOX_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("RESEARCH_INBOX_USER and RESEARCH_INBOX_APP_PASSWORD are not set.");
  }

  const startedAt = Date.now();
  const latest = await latestResearchEmailAt();
  const since = latest
    ? new Date(latest.getTime() - OVERLAP_DAYS * 86_400_000)
    : new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000);

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  try {
    const mailbox = await pickMailbox(client);
    const lock = await client.getMailboxLock(mailbox, { readOnly: true });
    try {
      // IMAP FROM is a substring match on the whole From header, the same
      // rule firmForSender applies, so one search per match word is enough.
      const uids = new Set<number>();
      for (const firm of RESEARCH_FIRMS) {
        for (const word of firm.match) {
          const found = await client.search({ since, from: word }, { uid: true });
          for (const uid of found || []) uids.add(uid);
        }
      }

      type Candidate = { uid: number; messageId: string; firm: string; date: Date };
      const candidates: Candidate[] = [];
      if (uids.size > 0) {
        for await (const msg of client.fetch([...uids], { uid: true, envelope: true }, { uid: true })) {
          const env = msg.envelope;
          const from = env?.from?.[0];
          const firm = firmForSender(from?.name ?? null, from?.address ?? null);
          if (!env || !firm) continue;
          const date = env.date ? new Date(env.date) : new Date();
          candidates.push({
            uid: msg.uid,
            messageId: env.messageId || fallbackMessageId(from?.address, date, env.subject),
            firm: firm.slug,
            date,
          });
        }
      }

      const stored = await existingMessageIds(candidates.map((c) => c.messageId));
      const fresh = candidates
        .filter((c) => !stored.has(c.messageId))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      const batch = fresh.slice(0, MAX_PER_RUN);

      if (batch.length > 0) await ensureBucket();

      const errors: string[] = [];
      let imported = 0;
      let attempted = 0;
      for (const c of batch) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break;
        attempted++;
        try {
          const msg = await client.fetchOne(String(c.uid), { source: true }, { uid: true });
          if (!msg || !msg.source) throw new Error("message has no body");
          if (await importMessage(c.firm, c.messageId, msg.source)) imported++;
        } catch (err) {
          errors.push(`${c.messageId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return {
        mailbox,
        since: since.toISOString(),
        found: candidates.length,
        imported,
        remaining: fresh.length - attempted,
        errors,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Gmail's All Mail, so a filter that archives research on arrival doesn't
 * hide it from the import. Found by its special-use flag rather than its name,
 * which Gmail localizes. RESEARCH_INBOX_MAILBOX overrides both.
 */
async function pickMailbox(client: ImapFlow): Promise<string> {
  const override = process.env.RESEARCH_INBOX_MAILBOX?.trim();
  if (override) return override;
  const boxes = await client.list();
  return boxes.find((b) => b.specialUse === "\\All")?.path ?? "INBOX";
}

function fallbackMessageId(address: string | undefined, date: Date, subject: string | undefined) {
  return `<no-id:${address ?? "unknown"}:${date.toISOString()}:${subject ?? ""}>`;
}

async function existingMessageIds(ids: string[]): Promise<Set<string>> {
  const admin = createAdminClient();
  const found = new Set<string>();
  // Chunked: a long .in() list becomes a long URL.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from("corporate_research_emails")
      .select("message_id")
      .in("message_id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) found.add(row.message_id as string);
  }
  return found;
}

async function ensureBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage.createBucket(BUCKET, { public: false, allowedMimeTypes: null });
  }
}

/** Stores one email. Returns false when another run stored it first. */
async function importMessage(firm: string, messageId: string, source: Buffer): Promise<boolean> {
  // cid: images are inlined as data URIs by default, so the stored HTML shows
  // its charts without anything else to fetch.
  const parsed = await simpleParser(source);
  const admin = createAdminClient();
  const receivedAt = parsed.date ?? new Date();
  const from = parsed.from?.value?.[0];

  // Inline images are already inside the HTML; only real attachments are kept.
  const attachments: ResearchAttachment[] = [];
  for (const att of parsed.attachments.filter((a) => !a.related)) {
    const name = att.filename || "attachment";
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${firm}/${receivedAt.toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, att.content, { contentType: att.contentType, upsert: false });
    if (error) throw new Error(`attachment ${name}: ${error.message}`);
    attachments.push({
      name,
      contentType: att.contentType,
      size: att.size,
      path: `${BUCKET}/${objectPath}`,
    });
  }

  const { error } = await admin.from("corporate_research_emails").insert({
    firm,
    message_id: messageId,
    from_name: from?.name || null,
    from_address: from?.address || null,
    subject: parsed.subject ?? "",
    received_at: receivedAt.toISOString(),
    html_body: parsed.html || null,
    text_body: parsed.text ?? null,
    attachments,
  });

  if (error) {
    // Don't leave orphaned files behind a row that was never written.
    if (attachments.length > 0) {
      await admin.storage
        .from(BUCKET)
        .remove(attachments.map((a) => a.path.slice(BUCKET.length + 1)));
    }
    if (error.code === "23505") return false; // a concurrent run got there first
    throw new Error(error.message);
  }
  return true;
}
