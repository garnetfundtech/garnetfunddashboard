"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";

export function ResourceViewButton({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-[7px] p-1.5 text-white transition-colors hover:bg-white/5"
        title="View"
      >
        <Eye className="h-4 w-4" />
      </button>

      {open && (
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
            <iframe
              src={url}
              className="min-h-0 flex-1 rounded-[10px]"
              title={title}
            />
          </div>
        </div>
      )}
    </>
  );
}
