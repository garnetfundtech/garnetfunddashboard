"use client";

import { useRef, useState, useTransition } from "react";
import { FilePlus2, X, Upload, Ban } from "lucide-react";
import { uploadResearchAction } from "@/app/(dashboard)/research/actions";

export function ResearchUploadModal() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
  }

  function handleClose() {
    setOpen(false);
    setFile(null);
    setDownloadEnabled(false);
    formRef.current?.reset();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("downloadEnabled", String(downloadEnabled));
    startTransition(async () => {
      await uploadResearchAction(formData);
      handleClose();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#a80705] transition-colors"
      >
        <FilePlus2 className="h-4 w-4" />
        Upload Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="panel w-full max-w-md p-6">
            {/* Modal header */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Research</p>
                <h2 className="text-base font-semibold text-white">Upload Report</h2>
              </div>
              <button
                onClick={handleClose}
                className="rounded-[8px] p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
              {/* File picker */}
              <label className="glass-input flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center hover:bg-white/[0.06] transition-colors">
                <Upload className="h-5 w-5 text-zinc-400" />
                {file ? (
                  <span className="text-sm text-zinc-200">{file.name}</span>
                ) : (
                  <span className="text-sm text-zinc-400">Click to select a PDF</span>
                )}
                <input
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {/* Title */}
              <input
                name="title"
                placeholder="Report title"
                required
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />

              {/* Ticker + Author row */}
              <div className="flex gap-3">
                <input
                  name="ticker"
                  placeholder="Ticker (e.g. AAPL)"
                  className="glass-input w-28 shrink-0 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 uppercase"
                />
                <input
                  name="author"
                  placeholder="Author name"
                  className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                />
              </div>

              {/* Confidence + Download row */}
              <div className="flex gap-3">
                <select
                  name="confidence"
                  className="glass-input flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none"
                >
                  <option value="high">High confidence</option>
                  <option value="medium">Medium confidence</option>
                  <option value="low">Low confidence</option>
                </select>

                {/* Download toggle */}
                <button
                  type="button"
                  onClick={() => setDownloadEnabled((v) => !v)}
                  className={`glass-input flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                    downloadEnabled
                      ? "text-emerald-400"
                      : "text-zinc-500"
                  }`}
                >
                  {downloadEnabled ? (
                    <Upload className="h-4 w-4" />
                  ) : (
                    <Ban className="h-4 w-4" />
                  )}
                  {downloadEnabled ? "Downloadable" : "View only"}
                </button>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-[10px] px-4 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !file}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-[#a80705] transition-colors"
                >
                  {isPending ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
