"use client";

/**
 * In-place preview for an uploaded file, whatever it happens to be.
 *
 * One component per surface, so research, resources and team files all show
 * the same thing for the same file. Which renderer runs is decided by
 * previewKindOf (lib/file-types.ts); this only knows how to draw each one.
 *
 * Everything heavy — pdf.js, SheetJS, mammoth — is imported dynamically, so
 * opening a PDF never downloads the spreadsheet reader and a fund member who
 * only ever reads write-ups never pays for any of it.
 *
 * The bytes are fetched from the same short-lived signed URL the download
 * button uses. Nothing is sent anywhere for conversion: a document that can't
 * be rendered locally gets an honest message and the file itself, rather than
 * being shipped to a third-party viewer.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
// Tables, strikethrough and task lists. react-markdown is CommonMark-only
// without this, and a markdown memo's table would render as rows of pipes.
import remarkGfm from "remark-gfm";
import { PdfViewer } from "@/components/dashboard/pdf-viewer";
import type { PreviewKind } from "@/lib/file-types";

/** Matches PdfViewer's frame so the panel doesn't resize between file types. */
const SHELL = "panel flex h-full flex-col overflow-hidden rounded-none p-0";
const SCROLL = "min-h-0 flex-1 overflow-auto bg-paper-2 p-3";

/** Rendered text is capped well below the 20 MB upload limit — a multi-megabyte
 *  log dropped into the DOM in one go locks the tab up. */
const MAX_TEXT_CHARS = 400_000;
/** Per worksheet. A model with 50k rows should preview instantly, not parse
 *  itself into a stall. */
const MAX_SHEET_ROWS = 300;
const MAX_SHEET_COLS = 40;

function Spinner() {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-ink-3" />
    </div>
  );
}

function Notice({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "bad" }) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-6">
      <p className={`max-w-sm text-center text-[13.5px] ${tone === "bad" ? "text-neg" : "text-ink-2"}`}>
        {children}
      </p>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className={SHELL}>{children}</div>;
}

/**
 * Fetches the file once as bytes.
 *
 * A signed URL is good for ten minutes and each renderer wants the whole file
 * anyway (a spreadsheet and a .docx are both zip archives — there is no
 * useful partial read), so there's nothing to gain from streaming. The abort
 * on unmount matters: closing the viewer mid-download of a 20 MB model should
 * stop the transfer, not finish it into a component that's gone.
 */
type FetchState =
  | { status: "loading" }
  | { status: "ok"; bytes: ArrayBuffer }
  | { status: "error"; message: string };

function useFileBytes(url: string | undefined): FetchState {
  // Stamped with the URL it belongs to, so a result for the previous file is
  // ignored during render rather than being cleared by a second setState.
  const [loaded, setLoaded] = useState<{ url: string; result: FetchState } | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => setLoaded({ url, result: { status: "ok", bytes } }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          url,
          result: {
            status: "error",
            message:
              err instanceof Error && /^\d+$/.test(err.message)
                ? "This file's link has expired. Close the viewer and open it again."
                : "The file couldn't be loaded.",
          },
        });
      });

    return () => controller.abort();
  }, [url]);

  if (!url || !loaded || loaded.url !== url) return { status: "loading" };
  return loaded.result;
}

// ── Spreadsheets ────────────────────────────────────────────────────────────

type SheetData = { names: string[]; rows: string[][]; truncated: boolean };

function SheetPreview({ url }: { url?: string }) {
  const file = useFileBytes(url);
  const [active, setActive] = useState(0);
  const [book, setBook] = useState<{ names: string[] } | null>(null);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [failed, setFailed] = useState("");
  // Held across tab switches so changing worksheet doesn't re-download.
  const workbookRef = useRef<unknown>(null);

  useEffect(() => {
    if (file.status !== "ok") return;
    let cancelled = false;

    (async () => {
      try {
        const XLSX = await import("xlsx");
        // cellDates matters only for cells the file has no cached display
        // string for; what actually keeps a date from showing as 45292 is
        // reading formatted values below (raw: false).
        const wb = XLSX.read(new Uint8Array(file.bytes), { type: "array", cellDates: true });
        if (cancelled) return;
        workbookRef.current = wb;
        setBook({ names: wb.SheetNames });
        setActive(0);
      } catch {
        if (!cancelled) setFailed("This spreadsheet couldn't be read.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const wb = workbookRef.current as
      | { Sheets: Record<string, unknown>; SheetNames: string[] }
      | null;
    if (!wb || !book) return;
    let cancelled = false;

    (async () => {
      const XLSX = await import("xlsx");
      const ws = wb.Sheets[book.names[active]];
      if (!ws) return;
      // raw:false gives the formatted value the sheet itself displays, so a
      // percentage reads as 4.0% and not 0.04.
      const all = XLSX.utils.sheet_to_json(ws as never, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      }) as unknown[][];
      if (cancelled) return;

      const rows = all
        .slice(0, MAX_SHEET_ROWS)
        .map((r) => r.slice(0, MAX_SHEET_COLS).map((c) => (c == null ? "" : String(c))));
      setSheet({
        names: book.names,
        rows,
        truncated: all.length > MAX_SHEET_ROWS || all.some((r) => r.length > MAX_SHEET_COLS),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [active, book]);

  if (failed) return <Frame><Notice tone="bad">{failed}</Notice></Frame>;
  if (file.status === "error") return <Frame><Notice tone="bad">{file.message}</Notice></Frame>;
  if (!sheet) return <Frame><Spinner /></Frame>;

  const [headerRow, ...bodyRows] = sheet.rows;

  return (
    <Frame>
      {sheet.names.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-paper px-3 py-2">
          {sheet.names.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-none px-2.5 py-1 text-[12.5px] transition-colors ${
                i === active
                  ? "bg-paper-2 font-medium text-ink"
                  : "text-ink-3 hover:bg-paper-2 hover:text-ink-2"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className={SCROLL}>
        {sheet.rows.length === 0 ? (
          <Notice>This sheet is empty.</Notice>
        ) : (
          <table className="w-max border-collapse bg-paper text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border border-line bg-paper-2 px-2 py-1 text-ink-3" />
                {headerRow.map((cell, i) => (
                  <th
                    key={i}
                    className="border border-line bg-paper-2 px-2 py-1 text-left font-medium text-ink"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, r) => (
                <tr key={r}>
                  <td className="sticky left-0 z-10 border border-line bg-paper-2 px-2 py-1 text-right tabular-nums text-[11px] text-ink-3">
                    {r + 2}
                  </td>
                  {headerRow.map((_, c) => (
                    <td key={c} className="border border-line px-2 py-1 tabular-nums text-ink-2">
                      {row[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sheet.truncated && (
        <p className="shrink-0 border-t border-line bg-paper px-3 py-1.5 text-[12px] text-ink-3">
          Showing the first {MAX_SHEET_ROWS} rows. Download the file for the rest.
        </p>
      )}
    </Frame>
  );
}

// ── Word documents ──────────────────────────────────────────────────────────

/**
 * Strips everything from mammoth's output that isn't document content.
 *
 * mammoth builds HTML from the docx's own model rather than copying markup
 * through, so this is a second line rather than the first. It is still worth
 * having: the file came from a person, the output goes in via innerHTML, and
 * an allowlist is a much shorter thing to reason about than a converter's
 * complete output surface. Links are restricted to real web schemes and
 * images to inline data, which is what mammoth emits for embedded pictures.
 */
const ALLOWED_TAGS = new Set([
  "P", "BR", "HR", "SPAN", "DIV",
  "STRONG", "B", "EM", "I", "U", "S", "SUP", "SUB", "CODE", "PRE",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "BLOCKQUOTE",
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
  "A", "IMG",
]);

function sanitizeDocxHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (!ALLOWED_TAGS.has(el.tagName)) {
      // Keep the words, drop the element.
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const ok =
        (el.tagName === "A" && name === "href" && /^(https?:|mailto:)/i.test(attr.value)) ||
        (el.tagName === "IMG" && name === "src" && /^data:image\//i.test(attr.value)) ||
        (el.tagName === "IMG" && name === "alt");
      if (!ok) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noreferrer noopener");
    }
  }

  return doc.body.innerHTML;
}

function DocxPreview({ url }: { url?: string }) {
  const file = useFileBytes(url);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    if (file.status !== "ok") return;
    let cancelled = false;

    (async () => {
      try {
        // Plain "mammoth", not the mammoth.browser build: the package's own
        // `browser` field already redirects its two Node-only modules (unzip,
        // file reading) to browser equivalents, and this entry point is the
        // one that ships types.
        const mammoth = await import("mammoth");
        const { value } = await mammoth.convertToHtml({ arrayBuffer: file.bytes });
        if (!cancelled) setHtml(sanitizeDocxHtml(value));
      } catch {
        if (!cancelled) setFailed("This document couldn't be read.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (failed) return <Frame><Notice tone="bad">{failed}</Notice></Frame>;
  if (file.status === "error") return <Frame><Notice tone="bad">{file.message}</Notice></Frame>;
  if (html === null) return <Frame><Spinner /></Frame>;
  if (html.trim() === "") {
    return (
      <Frame>
        <Notice>
          This document has no text to show — it may be made up entirely of
          images or shapes. Download it to open in Word.
        </Notice>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className={SCROLL}>
        <div
          className="doc-body mx-auto max-w-[70ch] bg-paper p-8 text-[14px] leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </Frame>
  );
}

// ── Plain text and markdown ─────────────────────────────────────────────────

function TextPreview({ url, markdown }: { url?: string; markdown: boolean }) {
  const file = useFileBytes(url);

  // Plain derivation of the bytes, so it belongs in render rather than an
  // effect. A file that isn't valid UTF-8 decodes to replacement characters
  // rather than throwing, which is the right outcome: some of it is readable.
  const decoded = useMemo(
    () => (file.status === "ok" ? new TextDecoder("utf-8").decode(file.bytes) : null),
    [file],
  );
  const truncated = decoded !== null && decoded.length > MAX_TEXT_CHARS;
  const text = decoded === null ? null : decoded.slice(0, MAX_TEXT_CHARS);

  if (file.status === "error") return <Frame><Notice tone="bad">{file.message}</Notice></Frame>;
  if (text === null) return <Frame><Spinner /></Frame>;

  return (
    <Frame>
      <div className={SCROLL}>
        {markdown ? (
          <div className="doc-body mx-auto max-w-[70ch] bg-paper p-8 text-[14px] leading-relaxed text-ink">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words bg-paper p-4 font-mono text-[12.5px] leading-relaxed text-ink">
            {text}
          </pre>
        )}
      </div>
      {truncated && (
        <p className="shrink-0 border-t border-line bg-paper px-3 py-1.5 text-[12px] text-ink-3">
          Showing the first {(MAX_TEXT_CHARS / 1000).toFixed(0)}k characters. Download the file for the rest.
        </p>
      )}
    </Frame>
  );
}

// ── Images and media ────────────────────────────────────────────────────────

function ImagePreview({ url, name, scale }: { url?: string; name: string; scale: number }) {
  const [failed, setFailed] = useState(false);
  if (!url) return <Frame><Spinner /></Frame>;
  if (failed) return <Frame><Notice tone="bad">This image couldn&apos;t be displayed.</Notice></Frame>;

  return (
    <Frame>
      <div className={`${SCROLL} flex items-start justify-center`}>
        {/* Zoom scales the image from its natural size rather than setting a
            width: a width of 100% would blow a small chart up to the width of
            the panel and leave it blurry, while a large screenshot still needs
            to be shrunk to fit. */}
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            onError={() => setFailed(true)}
            className="h-auto max-w-full object-contain"
          />
        </div>
      </div>
    </Frame>
  );
}

function MediaPreview({ url, kind }: { url?: string; kind: "video" | "audio" }) {
  const [failed, setFailed] = useState(false);
  if (!url) return <Frame><Spinner /></Frame>;

  if (failed) {
    return (
      <Frame>
        <Notice>
          This browser can&apos;t play this file&apos;s format. Download it to
          play it locally.
        </Notice>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className={`${SCROLL} flex items-center justify-center`}>
        {kind === "video" ? (
          <video src={url} controls onError={() => setFailed(true)} className="max-h-full max-w-full" />
        ) : (
          <audio src={url} controls onError={() => setFailed(true)} className="w-full max-w-md" />
        )}
      </div>
    </Frame>
  );
}

// ── Entry point ─────────────────────────────────────────────────────────────

export type FilePreviewProps = {
  kind: PreviewKind;
  url?: string;
  /** Filename or title, used as image alt text. */
  name: string;
  /** Applies to the two kinds where zooming means anything: PDF and images. */
  scale?: number;
  onLoadTotalPages?: (count: number) => void;
  onPageChange?: (page: number) => void;
};

export function FilePreview({
  kind,
  url,
  name,
  scale = 1,
  onLoadTotalPages,
  onPageChange,
}: FilePreviewProps) {
  switch (kind) {
    case "pdf":
      return (
        <PdfViewer
          url={url}
          scale={scale}
          onLoadTotalPages={onLoadTotalPages}
          onPageChange={onPageChange}
        />
      );
    case "image":
      return <ImagePreview url={url} name={name} scale={scale} />;
    case "video":
    case "audio":
      return <MediaPreview url={url} kind={kind} />;
    case "sheet":
      return <SheetPreview url={url} />;
    case "docx":
      return <DocxPreview url={url} />;
    case "markdown":
      return <TextPreview url={url} markdown />;
    case "text":
      return <TextPreview url={url} markdown={false} />;
    default:
      return <Frame><Notice>There&apos;s no preview for this file type.</Notice></Frame>;
  }
}
