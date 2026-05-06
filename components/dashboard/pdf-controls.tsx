"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export function PdfControls({
  title,
  viewUrl,
  downloadUrl,
}: {
  title: string;
  viewUrl?: string;
  downloadUrl?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => viewUrl && setOpen(true)}
          disabled={!viewUrl}
          className="text-sm text-white transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          View
        </button>
        {downloadUrl ? (
          <Link
            href={downloadUrl}
            className="text-sm text-white transition-colors hover:text-zinc-300"
          >
            Download
          </Link>
        ) : (
          <span className="text-sm text-white opacity-30 cursor-not-allowed">Download</span>
        )}
      </div>

      {open && viewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel flex h-[85vh] w-full max-w-5xl flex-col p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-zinc-300">{title}</p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe src={viewUrl} className="min-h-0 flex-1 rounded-[10px]" title={title} />
          </div>
        </div>
      )}
    </>
  );
}
