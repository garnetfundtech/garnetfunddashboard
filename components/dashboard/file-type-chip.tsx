import { StatusPill, type Tone } from "@/components/dashboard/status-pill";
import { fileExtension } from "@/lib/file-types";

/**
 * Colour by family, so a list of mixed uploads reads at a glance: spreadsheets
 * green, documents blue, slides amber, PDFs red, media garnet. Anything
 * unlisted falls through to neutral rather than going unlabelled — uploads
 * accept every file type, so this map can't be a whitelist.
 */
const TONES: Record<string, Tone> = {
  pdf: "rose",

  xlsx: "emerald",
  xlsm: "emerald",
  xlsb: "emerald",
  xls: "emerald",
  csv: "emerald",
  tsv: "emerald",
  numbers: "emerald",

  docx: "blue",
  doc: "blue",
  rtf: "blue",
  txt: "blue",
  md: "blue",
  pages: "blue",

  pptx: "amber",
  ppt: "amber",
  key: "amber",

  mp4: "accent",
  mov: "accent",
  m4a: "accent",
  mp3: "accent",
  wav: "accent",
  png: "accent",
  jpg: "accent",
  jpeg: "accent",
  gif: "accent",
  webp: "accent",
  svg: "accent",
};

/**
 * The file-type chip shown in every file list.
 *
 * `source` is the storage path or filename — not the row's title, which for
 * research and resources is typed by hand and carries no extension. See
 * lib/file-types.ts.
 */
export function FileTypeChip({ source }: { source?: string | null }) {
  const ext = fileExtension(source);
  return (
    <StatusPill
      label={ext.toUpperCase() || "FILE"}
      tone={TONES[ext] ?? "neutral"}
      dot={false}
    />
  );
}
