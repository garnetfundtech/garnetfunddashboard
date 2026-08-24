"use client";

import dynamic from "next/dynamic";
import type { PdfViewerProps } from "./pdf-viewer-inner";

const PdfViewerClient = dynamic(
  () => import("./pdf-viewer-inner").then((mod) => ({ default: mod.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="panel flex h-full flex-col items-center justify-center overflow-hidden rounded-none p-0">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-ink-3" />
      </div>
    ),
  },
);

export type { PdfViewerProps };

export function PdfViewer(props: PdfViewerProps) {
  return <PdfViewerClient {...props} />;
}

export { usePdfPrint } from "./use-pdf-print";
