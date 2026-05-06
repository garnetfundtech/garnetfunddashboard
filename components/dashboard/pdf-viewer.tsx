"use client";

import dynamic from "next/dynamic";
import type { PdfViewerProps } from "./pdf-viewer-inner";

const PdfViewerClient = dynamic(
  () => import("./pdf-viewer-inner").then((mod) => ({ default: mod.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="panel flex h-[640px] items-center justify-center text-sm text-zinc-400">
        Loading viewer…
      </div>
    ),
  },
);

export type { PdfViewerProps };

export function PdfViewer(props: PdfViewerProps) {
  return <PdfViewerClient {...props} />;
}

export { usePdfPrint } from "./use-pdf-print";
