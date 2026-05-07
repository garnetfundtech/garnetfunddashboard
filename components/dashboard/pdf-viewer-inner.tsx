"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Same worker bundle react-pdf expects (main pdfjs-dist build, not legacy) — Turbopack rewrites the URL.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type PdfViewerProps = {
  url?: string;
  scale?: number;
  onLoadTotalPages?: (count: number) => void;
  onPageChange?: (page: number) => void;
};

/** Loaded only on the client via dynamic import — avoids SSR evaluating pdf.js (DOMMatrix). */
export function PdfViewer({ url, scale = 1, onLoadTotalPages, onPageChange }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const onPageChangeRef = useRef(onPageChange);

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function updateCurrentPage() {
      if (!scrollRef.current) return;
      const scrollTop = scrollRef.current.scrollTop;
      const clientHeight = scrollRef.current.clientHeight;
      const scrollMid = scrollTop + clientHeight / 2;

      let closestPage = 1;
      let closestDist = Infinity;

      pageRefs.current.forEach((ref, i) => {
        if (!ref) return;
        const mid = ref.offsetTop + ref.offsetHeight / 2;
        const dist = Math.abs(mid - scrollMid);
        if (dist < closestDist) {
          closestDist = dist;
          closestPage = i + 1;
        }
      });

      onPageChangeRef.current?.(closestPage);
    }

    container.addEventListener("scroll", updateCurrentPage, { passive: true });
    return () => container.removeEventListener("scroll", updateCurrentPage);
  }, []);

  if (!url) {
    return (
      <div className="flex h-[640px] items-center justify-center rounded-[16px] border border-white/[0.08] bg-black/85 backdrop-blur-md text-sm text-zinc-400 shadow-2xl">
        Select a file with a signed URL to preview.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[16px] border border-white/[0.08] bg-black/85 backdrop-blur-md p-0 shadow-2xl">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-black/20 p-3">
        <div className="mx-auto w-fit">
          <Document
            file={url}
            loading={<div className="text-xs text-zinc-500">Loading…</div>}
            error={<div className="text-xs text-rose-400">Could not load PDF</div>}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              pageRefs.current = new Array(n).fill(null);
              onLoadTotalPages?.(n);
            }}
          >
            {numPages !== null &&
              Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i + 1}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                >
                  <Page pageNumber={i + 1} scale={scale} renderTextLayer={false} renderAnnotationLayer={false} />
                  {i < numPages - 1 && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-[10px] tabular-nums text-zinc-600">
                        {i + 1} / {numPages}
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                  )}
                </div>
              ))}
          </Document>
        </div>
      </div>
    </div>
  );
}
