"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Avoid range/stream requests; they often break on signed Supabase/S3 URLs. */
const PDF_LOAD_OPTIONS = { disableRange: true as const, disableStream: true as const };

export function PdfViewer({
  url,
  scale = 1,
  onLoadTotalPages,
  onPageChange,
}: {
  url?: string;
  scale?: number;
  onLoadTotalPages?: (count: number) => void;
  onPageChange?: (page: number) => void;
}) {
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
      <div className="panel flex h-[640px] items-center justify-center text-sm text-zinc-400">
        Select a file with a signed URL to preview.
      </div>
    );
  }

  return (
    <div className="panel flex h-full flex-col overflow-hidden rounded-[16px] p-0">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-black/20 p-3">
        <div className="mx-auto w-fit">
          <Document
            file={url}
            options={PDF_LOAD_OPTIONS}
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
                  ref={(el) => { pageRefs.current[i] = el; }}
                >
                  <Page
                    pageNumber={i + 1}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
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

export function usePdfPrint(url?: string) {
  useEffect(() => {}, []);

  return () => {
    if (!url) return;
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) return;
    // Best-effort: try to print once the PDF viewer loads.
    const t = window.setInterval(() => {
      try {
        if (w.document?.readyState === "complete") {
          window.clearInterval(t);
          w.focus();
          w.print();
        }
      } catch {
        // Cross-origin PDFs may block access; still try printing.
        window.clearInterval(t);
        w.focus();
        w.print();
      }
    }, 400);
    window.setTimeout(() => window.clearInterval(t), 5000);
  };
}
