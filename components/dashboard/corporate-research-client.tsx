"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Paperclip, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { TableShell } from "@/components/dashboard/table-shell";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { GhostBtn } from "@/components/dashboard/buttons";
import { PdfViewer } from "@/components/dashboard/pdf-viewer";
import type { ResearchEmail, ResearchEmailSummary } from "@/lib/corporate-research";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * The email as a standalone document for a sandboxed iframe.
 *
 * Sell-side emails are laid out with their own tables and inline styles, so
 * they are shown as sent rather than stripped down to the app's typography.
 * The sandbox grants nothing: the email cannot run code, reach the
 * dashboard's cookies or open a window, and the CSP keeps it from loading
 * anything but images, styles and fonts. Its links arrive with their
 * destinations already removed (withoutLinks, on the server).
 *
 * The head tags go first; the parser hoists them into the head even when the
 * email brings its own <html>, and ignores the email's doctype after them.
 */
function emailDocument(email: ResearchEmail) {
  const head =
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:">` +
    `<style>html{background:#fff}a{cursor:default}body{margin:16px;color:#111;font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif}</style>`;
  const body = email.html_body
    ? email.html_body
    : `<pre style="white-space:pre-wrap;font:inherit;margin:0">${escapeHtml(email.text_body ?? "")}</pre>`;
  return head + body;
}

export function CorporateResearchClient({
  firms,
  firm,
  emails,
  opened,
}: {
  firms: { slug: string; label: string }[];
  firm: string;
  emails: ResearchEmailSummary[];
  opened: ResearchEmail | null;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const firmLabel = firms.find((f) => f.slug === firm)?.label ?? firm;

  function go(nextFirm: string, open?: string) {
    const params = new URLSearchParams({ firm: nextFirm });
    if (open) params.set("open", open);
    router.push(`/corporate-research?${params}`);
  }

  function checkForNew() {
    setSyncMessage(null);
    startRefresh(async () => {
      const res = await fetch("/api/corporate-research/sync", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!body) {
        // Not our JSON at all — the platform answered instead, most often a
        // timeout. Whatever was imported before it stopped is kept.
        setSyncMessage(`Check didn't finish (HTTP ${res.status}). Try again.`);
        router.refresh();
        return;
      }
      if (!res.ok || !body.ok) {
        setSyncMessage(body.message ?? "Couldn't reach the inbox.");
        return;
      }
      setSyncMessage(
        body.imported === 0
          ? "Up to date."
          : `${body.imported} new email${body.imported === 1 ? "" : "s"}` +
              (body.remaining > 0 ? ` — ${body.remaining} more on the next check.` : "."),
      );
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Corporate Research"
        meta={
          syncMessage ?? `${emails.length} ${firmLabel} email${emails.length === 1 ? "" : "s"}`
        }
        actions={
          <GhostBtn onClick={checkForNew} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Checking…" : "Check for new"}
          </GhostBtn>
        }
      />

      <div className="flex min-h-0 flex-1 gap-3">
        <TableShell
          title={firmLabel}
          count={emails.length}
          className="w-[400px] shrink-0"
          actions={
            firms.length > 1 ? (
              <FilterTabs
                options={firms.map((f) => ({ value: f.slug, label: f.label }))}
                value={firm}
                onChange={(slug) => go(slug)}
              />
            ) : null
          }
        >
          {emails.length === 0 ? (
            <p className="px-4 py-12 text-center text-[13.5px] text-ink-3">
              No {firmLabel} research yet. New emails are imported once a day, or use
              “Check for new”.
            </p>
          ) : (
            <ul>
              {emails.map((email) => (
                <li key={email.id}>
                  <button
                    type="button"
                    onClick={() => go(firm, email.id)}
                    className={`block w-full border-b border-line px-3 py-2.5 text-left transition hover:bg-paper-3 ${
                      opened?.id === email.id ? "bg-paper-3" : ""
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-ink">
                        {email.subject || "(no subject)"}
                      </span>
                      {email.attachments.length > 0 && (
                        <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-3">
                      {fmtDate(email.received_at)}
                      {email.from_name ? ` · ${email.from_name}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TableShell>

        {opened ? (
          <EmailViewer key={opened.id} email={opened} />
        ) : (
          <div className="panel flex min-w-0 flex-1 flex-col items-center justify-center gap-2 text-ink-3">
            <Mail className="h-6 w-6" strokeWidth={1.5} />
            <p className="text-[13.5px]">Select an email to read it.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One email, or one of its attachments. There is deliberately no download or
 * print control here: the research is licensed to the fund, and attachments
 * are served inline through /api/corporate-research/attachment rather than
 * as a signed Storage link.
 */
function EmailViewer({ email }: { email: ResearchEmail }) {
  // null shows the email itself; a number shows that attachment.
  const [view, setView] = useState<number | null>(null);
  const attachment = view == null ? null : email.attachments[view];
  const attachmentUrl = `/api/corporate-research/attachment?email=${email.id}&n=${view}`;

  return (
    <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-1 border-b border-line-2 bg-paper-3 px-4 py-3">
        <h2 className="text-[15px] font-semibold leading-snug text-ink">
          {email.subject || "(no subject)"}
        </h2>
        <p className="text-[12.5px] text-ink-3">
          {email.from_name || email.from_address}
          {email.from_name && email.from_address ? ` <${email.from_address}>` : ""} ·{" "}
          {fmtDateTime(email.received_at)}
        </p>
        {email.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5">
            <ViewTab active={view == null} onClick={() => setView(null)}>
              Email
            </ViewTab>
            {email.attachments.map((a, i) => (
              <ViewTab key={a.path} active={view === i} onClick={() => setView(i)}>
                <Paperclip className="h-3 w-3" />
                {a.name}
              </ViewTab>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 bg-paper-2">
        {attachment == null ? (
          <iframe
            title={email.subject}
            srcDoc={emailDocument(email)}
            sandbox=""
            className="h-full w-full border-0 bg-white"
          />
        ) : attachment.contentType === "application/pdf" ? (
          <PdfViewer url={attachmentUrl} />
        ) : attachment.contentType.startsWith("image/") ? (
          <div className="h-full overflow-auto p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- streamed from an authenticated route, not optimizable */}
            <img src={attachmentUrl} alt={attachment.name} className="mx-auto max-w-full" />
          </div>
        ) : (
          <p className="px-4 py-12 text-center text-[13.5px] text-ink-3">
            {attachment.name} can’t be previewed here.
          </p>
        )}
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-[240px] items-center gap-1 truncate border px-2 py-[3px] text-[12px] transition-colors ${
        active
          ? "border-line bg-surface text-ink"
          : "border-transparent text-ink-3 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
