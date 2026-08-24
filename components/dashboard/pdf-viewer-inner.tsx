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

  const spinner = (
    <div className="flex h-full min-h-[300px] items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-ink-3" />
    </div>
  );

  if (!url) {
    // Every file has a URL — this only shows for the moment between opening
    // the viewer and the on-demand signed URL arriving, so it should read as
    // "loading," not as though nothing were selected. Same wrapper as the
    // loaded state below so the panel doesn't resize once the PDF appears.
    return <div className="panel flex h-full flex-col overflow-hidden rounded-none p-0">{spinner}</div>;
  }

  return (
    <div className="panel flex h-full flex-col overflow-hidden rounded-none p-0">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-paper-2 p-3">
        <div className="mx-auto w-fit">
          <Document
            file={url}
            loading={spinner}
            error={<div className="text-xs text-neg">Could not load PDF</div>}
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
                      <div className="h-px flex-1 bg-paper-2" />
                      <span className="text-[11px] tabular-nums text-ink-3">
                        {i + 1} / {numPages}
                      </span>
                      <div className="h-px flex-1 bg-paper-2" />
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
