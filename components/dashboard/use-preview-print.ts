"use client";

/**
 * Printing whatever the viewer is currently showing.
 *
 * Print used to be a PDF-only affordance, and the PDF path itself didn't
 * work: it opened the signed URL in a popup and called print() on it, which
 * the browser refuses across origins — storage serves those URLs from its own
 * host, so `w.document` and `w.print()` both throw and the user is left
 * looking at a new tab that never prints.
 *
 * Both problems have the same answer: print from a same-origin iframe this
 * page owns.
 *
 *   pdf      fetched as bytes and printed from a blob URL, which is
 *            same-origin, so the print dialog can actually be opened.
 *   anything
 *   rendered the markup already on screen — the spreadsheet's grid, the
 *            document, the text — copied into an iframe along with the app's
 *            own stylesheets, so what prints is what was being read.
 *
 * Video and audio have nothing to put on paper; callers gate the button with
 * hasRenderedContent (lib/file-types.ts).
 */

import { useCallback } from "react";
import type { RefObject } from "react";
import type { PreviewKind } from "@/lib/file-types";

/** Off-screen at roughly a sheet of paper, rather than hidden or zero-sized:
 *  a frame with no layout has been known to print blank. */
const FRAME_STYLE =
  "position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;";

/** Long enough for the dialog to be answered: pulling the frame out of the
 *  document while the print job is still queued cancels it. */
const CLEANUP_MS = 60_000;

function makeFrame(): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.cssText = FRAME_STYLE;
  document.body.appendChild(frame);
  return frame;
}

function printFrame(frame: HTMLIFrameElement, revoke?: string) {
  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } catch {
    // A browser that won't print this is not something to throw over.
  }
  window.setTimeout(() => {
    frame.remove();
    if (revoke) URL.revokeObjectURL(revoke);
  }, CLEANUP_MS);
}

/** The file itself, printed from a blob so it counts as same-origin. */
async function printFile(url: string) {
  let blobUrl: string;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    blobUrl = URL.createObjectURL(await res.blob());
  } catch {
    return;
  }

  const frame = makeFrame();
  frame.addEventListener("load", () => printFrame(frame, blobUrl), { once: true });
  frame.src = blobUrl;
}

/** The rendered preview, printed with the app's own styling. */
async function printMarkup(markup: string, title: string) {
  const frame = makeFrame();
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
  doc.close();
  doc.title = title;

  // Cloning the page's stylesheets is what makes a printed spreadsheet look
  // like the one on screen — the markup carries class names and nothing else.
  // Waiting on each <link> matters: printing before they load prints unstyled.
  await Promise.all(
    Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(
      (node) =>
        new Promise<void>((resolve) => {
          const clone = node.cloneNode(true);
          if (clone instanceof HTMLLinkElement) {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          }
          doc.head.appendChild(clone);
          if (!(clone instanceof HTMLLinkElement)) resolve();
        }),
    ),
  );

  const page = doc.createElement("style");
  page.textContent =
    "@page{margin:14mm}body{margin:0;background:#fff}" +
    // The grid is sized to its widest column (w-max), which on paper would
    // simply run off the right edge. Clamping it to the page squeezes the
    // columns instead, which keeps all of them on the sheet.
    "table{max-width:100%}";
  doc.head.appendChild(page);

  doc.body.innerHTML = markup;
  printFrame(frame);
}

export function usePreviewPrint({
  kind,
  url,
  title,
  contentRef,
}: {
  kind: PreviewKind;
  /** Signed URL of the file, used for PDFs. */
  url?: string;
  title: string;
  /** The node holding the rendered preview, for everything else. */
  contentRef: RefObject<HTMLDivElement | null>;
}) {
  return useCallback(() => {
    if (kind === "pdf") {
      if (url) void printFile(url);
      return;
    }
    const markup = contentRef.current?.innerHTML;
    if (markup) void printMarkup(markup, title);
  }, [kind, url, title, contentRef]);
}
