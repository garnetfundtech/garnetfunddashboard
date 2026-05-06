"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

export function PdfViewer({ url }: { url?: string }) {
  const [zoom, setZoom] = useState(1);
  const scaled = useMemo(() => Math.max(0.6, Math.min(2, zoom)), [zoom]);

  if (!url) {
    return (
      <div className="panel flex h-[640px] items-center justify-center text-sm text-zinc-400">
        Select a file with a signed URL to preview.
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <p className="caps-label">In-app Viewer</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-zinc-300"
            onClick={() => setZoom((value) => value - 0.1)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-xs text-zinc-400">{Math.round(scaled * 100)}%</span>
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-zinc-300"
            onClick={() => setZoom((value) => value + 0.1)}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="h-[640px] overflow-auto bg-black p-2">
        <div style={{ transform: `scale(${scaled})`, transformOrigin: "top left" }}>
          <iframe src={url} className="h-[620px] w-[940px] rounded-md border border-[var(--border)]" />
        </div>
      </div>
    </div>
  );
}
