"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

export function PdfThumbnail({
  url,
  title,
}: {
  url?: string;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );

  const stableUrl = useMemo(() => url, [url]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!stableUrl || !canvasRef.current) {
        setStatus("idle");
        return;
      }

      setStatus("loading");

      try {
        const pdfjs = (await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        )) as PdfJsModule;

        // Turbopack-friendly worker wiring
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

        // Render a crisp thumbnail and then let CSS fit it into 16:9 container.
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = 520; // plenty for a small table thumbnail
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        canvas.width = Math.floor(scaled.width);
        canvas.height = Math.floor(scaled.height);

        await page.render({ canvasContext: ctx, viewport: scaled }).promise;

        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [stableUrl]);

  return (
    <div className="glass-input relative aspect-video w-[132px] overflow-hidden rounded-[10px]">
      {status === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      {!url || status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500">
          No preview
        </div>
      ) : null}

      <div className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full"
          aria-label={`${title} thumbnail`}
        />
      </div>
    </div>
  );
}

