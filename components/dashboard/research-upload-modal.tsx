"use client";

import { useRef, useState, useTransition } from "react";
import { FilePlus2, X, Upload, Ban, Download } from "lucide-react";
import { uploadResearchAction } from "@/app/(dashboard)/research/actions";

export function ResearchUploadModal() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

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
        className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#a80705]"
      >
        <FilePlus2 className="h-4 w-4" />
        Upload
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Research</p>
                <h2 className="text-base font-semibold text-white">Upload Report</h2>
              </div>
              <button
                onClick={handleClose}
                className="rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
              {/* File picker */}
              <label className="glass-input flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center transition-colors hover:bg-white/[0.06]">
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
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              {/* Title */}
              <input
                name="title"
                placeholder="Report title"
                required
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />

              {/* Ticker + Download toggle */}
              <input
                name="sector"
                placeholder="Sector tag (optional)"
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />
              <input
                name="analystName"
                placeholder="Analyst name (optional)"
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />
              <select
                name="thesisStatus"
                defaultValue="active"
                className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none"
              >
                <option value="active">Thesis: Active</option>
                <option value="under_review">Under Review</option>
                <option value="became_position">Became Position</option>
                <option value="rejected">Rejected</option>
              </select>
              <div className="flex gap-3">
                <input
                  name="ticker"
                  placeholder="Ticker"
                  className="glass-input w-28 shrink-0 px-3 py-2.5 text-sm uppercase text-zinc-200 outline-none placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => setDownloadEnabled((v) => !v)}
                  className={`glass-input flex flex-1 items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                    downloadEnabled ? "text-zinc-200" : "text-zinc-500"
                  }`}
                >
                  {downloadEnabled ? (
                    <Download className="h-4 w-4" />
                  ) : (
                    <Ban className="h-4 w-4" />
                  )}
                  {downloadEnabled ? "Downloadable" : "View only"}
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-[10px] px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !file}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a80705] disabled:opacity-50"
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
