"use client";

import dynamic from "next/dynamic";
import type { PdfViewerProps } from "./pdf-viewer-inner";

const PdfViewerClient = dynamic(
  () => import("./pdf-viewer-inner").then((mod) => ({ default: mod.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[640px] items-center justify-center rounded-[16px] border border-white/[0.08] bg-black/85 backdrop-blur-md text-sm text-zinc-400 shadow-2xl">
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
