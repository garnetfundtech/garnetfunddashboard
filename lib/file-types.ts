/**
 * What kind of file a stored row holds, and whether the app can render it
 * inline.
 *
 * Every upload surface — team files, research, resources — accepts any file
 * type: models (.xlsx/.xlsm), memos (.docx), decks (.pptx), recordings,
 * archives, and PDFs. Only PDFs can be shown in the built-in viewer, so each
 * table has to ask "is this a PDF?" before choosing between the inline viewer
 * and the download panel. That question used to be answered three different
 * ways; this is the one answer.
 *
 * The answer comes from the stored object path rather than the row's title.
 * A team file's title defaults to its filename, but a research post or a
 * resource is titled by hand ("Q3 Semiconductors Initiation"), so a title
 * carries no extension at all — and a title like "FY25 vs. FY26" would report
 * an extension of " fy26". The path always ends in the sanitized original
 * filename (see buildStorageObjectPath), so it always carries the real one.
 */

/**
 * Lowercase extension of a storage path or filename, without the dot.
 *
 * Empty when there isn't one, so callers can fall back to a generic label
 * rather than printing a slice of the name.
 */
export function fileExtension(source: string | null | undefined): string {
  if (!source) return "";
  // Callers pass a storage path, but a signed URL is the obvious thing to
  // reach for by mistake and its "?token=…" would otherwise become part of
  // the extension — yielding "none" and silently costing the file its
  // preview. Cheaper to tolerate here than to debug later.
  const withoutQuery = source.split(/[?#]/)[0];
  const name = withoutQuery.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  // A leading dot means a dotfile, not an extension.
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Whether the built-in viewer can render this file.
 *
 * Takes the mime type when the row stores one (team files do) and falls back
 * to the extension, because the browser reports an empty type for some files
 * and Office types vary by platform — .xlsm in particular arrives as
 * application/octet-stream more often than not.
 */
export function isPdfFile(file: {
  path?: string | null;
  mimeType?: string | null;
}): boolean {
  if (file.mimeType === "application/pdf") return true;
  return fileExtension(file.path) === "pdf";
}

/**
 * What the app can actually render for a file, in place, without sending it
 * anywhere.
 *
 * Uploads take every file type, so the viewer has to decide per file what to
 * show. The honest answer is not "everything": some formats have no viable
 * in-browser renderer, and the right behaviour for those is to say so and
 * offer the file, not to mount an empty frame over it.
 *
 *   pdf       pdf.js, via the existing PdfViewer
 *   image     the browser, through an <img>
 *   video     the browser, through a <video> — codec support is the browser's
 *             call, so the player reports its own failure
 *   audio     likewise, through an <audio>
 *   sheet     SheetJS, already a dependency for exports. Reads .xlsx/.xlsm/
 *             .xlsb/.xls and delimited text into a real grid, one tab per
 *             worksheet. Macros in an .xlsm are ignored, not run.
 *   docx      mammoth, converting the document to HTML we then sanitize
 *   markdown  react-markdown, already a dependency
 *   text      decoded and shown as-is. Source files (.html, .json, .ts…) are
 *             deliberately shown as text rather than executed or rendered.
 *   none      no renderer exists that's worth trusting — .pptx, .ppt, .doc,
 *             archives, binaries. These get the download panel.
 *
 * Driven by extension rather than the stored mime type, because the browser
 * that uploaded the file is what set that type, and it reports nothing at all
 * for .xlsm as often as not.
 */
export type PreviewKind =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "sheet"
  | "docx"
  | "markdown"
  | "text"
  | "none";

const BY_EXTENSION: Record<string, PreviewKind> = {
  pdf: "pdf",

  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  avif: "image", bmp: "image", ico: "image", svg: "image",

  mp4: "video", webm: "video", m4v: "video", mov: "video", ogv: "video",

  mp3: "audio", m4a: "audio", wav: "audio", aac: "audio", oga: "audio",
  ogg: "audio", flac: "audio",

  xlsx: "sheet", xlsm: "sheet", xlsb: "sheet", xls: "sheet",
  csv: "sheet", tsv: "sheet",

  docx: "docx",

  md: "markdown", markdown: "markdown", mdx: "markdown",

  txt: "text", log: "text", json: "text", xml: "text", yaml: "text",
  yml: "text", toml: "text", ini: "text", conf: "text", csvx: "text",
  html: "text", htm: "text", css: "text", js: "text", jsx: "text",
  ts: "text", tsx: "text", py: "text", r: "text", sql: "text", sh: "text",
};

export function previewKindOf(file: {
  path?: string | null;
  mimeType?: string | null;
}): PreviewKind {
  // A PDF whose name lost its extension is still a PDF, and the stored type is
  // the only thing that can say so.
  if (file.mimeType === "application/pdf") return "pdf";
  return BY_EXTENSION[fileExtension(file.path)] ?? "none";
}

/** Whether the viewer has anything to show, or should offer the file instead. */
export function canPreview(file: {
  path?: string | null;
  mimeType?: string | null;
}): boolean {
  return previewKindOf(file) !== "none";
}
