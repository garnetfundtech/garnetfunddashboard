"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

function fileExtLabel(url?: string): string {
  if (!url) return "";
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
  if (!m) return "FILE";
  const ext = m[1].toUpperCase();
  if (ext === "PPTX" || ext === "PPT") return "PPT";
  if (ext === "DOCX" || ext === "DOC") return "DOC";
  return ext;
}

export function PdfThumbnail({
  url,
  title,
  /** If true, renders zoom-to-fill mode for card grid view */
  fill = false,
}: {
  url?: string;
  title: string;
  fill?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const stableUrl = useMemo(() => url, [url]);
  const ext = fileExtLabel(url);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!stableUrl || !canvasRef.current) {
        setStatus("idle");
        return;
      }

      setStatus("loading");

      try {
        const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsModule;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjs as any).GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();

        const doc = await pdfjs.getDocument({ url: stableUrl }).promise;
        const page = await doc.getPage(1);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Render at a high enough resolution to look crisp when scaled to fill the card
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = fill ? 640 : 520;
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        canvas.width = Math.floor(scaled.width);
        canvas.height = Math.floor(scaled.height);

        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;

        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [stableUrl, fill]);

  if (fill) {
    // Card-grid mode: canvas fills full width, aligned to top, overflows at bottom (clipped).
    // This naturally shows the document from the top — portrait pages show ~top half,
    // landscape/slide pages show ~top three-quarters depending on aspect ratio.
    return (
      <div className="relative w-full overflow-hidden rounded-t-[12px]" style={{ aspectRatio: "16/9" }}>
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {(!url || status === "error") && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
            No preview
          </div>
        )}
        {/* Canvas fills width, overflows bottom — cropped to top of document */}
        <canvas
          ref={canvasRef}
          className="absolute inset-x-0 top-0 w-full"
          aria-label={`${title} thumbnail`}
        />
        {ext && (
          <div className="absolute bottom-3 right-3 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 backdrop-blur-sm">
            {ext}
          </div>
        )}
      </div>
    );
  }

  // Table mode (legacy)
  return (
    <div className="glass-input relative aspect-video w-[132px] overflow-hidden rounded-[10px]">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      {(!url || status === "error") && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500">
          No preview
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <canvas ref={canvasRef} className="max-h-full max-w-full" aria-label={`${title} thumbnail`} />
      </div>
      {ext && (
        <div className="absolute bottom-1 right-1 rounded-[4px] bg-black/50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
          {ext}
        </div>
      )}
    </div>
  );
}
