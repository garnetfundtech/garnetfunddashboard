"use client";

import { useRef, useState, useTransition } from "react";
import { FilePlus2, X, Upload, Ban, Download } from "lucide-react";
import { uploadResearchAction } from "@/app/(dashboard)/research/actions";

const SECTORS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Industrials",
  "Communication Services",
  "Energy",
  "Basic Materials",
  "Real Estate",
  "Utilities",
];

export function ResearchUploadForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("downloadEnabled", String(downloadEnabled));
    startTransition(async () => {
      await uploadResearchAction(formData);
      formRef.current?.reset();
      setFile(null);
      setDownloadEnabled(false);
      onSuccess?.();
    });
  }

  return (
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

      {/* Ticker + Company Name */}
      <div className="flex gap-3">
        <input
          name="ticker"
          placeholder="Ticker"
          required
          className="glass-input w-28 shrink-0 px-3 py-2.5 text-sm uppercase text-zinc-200 outline-none placeholder:text-zinc-500"
        />
        <input
          name="companyName"
          placeholder="Full company name"
          required
          className="glass-input flex-1 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
        />
      </div>

      {/* Sector dropdown */}
      <select
        name="sector"
        required
        defaultValue=""
        className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none"
      >
        <option value="" disabled>Select sector</option>
        {SECTORS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Analyst name */}
      <input
        name="analystName"
        placeholder="Analyst name"
        required
        className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
      />

      {/* Download toggle */}
      <button
        type="button"
        onClick={() => setDownloadEnabled((v) => !v)}
        className={`glass-input flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
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

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[10px] px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !file}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a80705] disabled:opacity-50"
        >
          {isPending ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

export function ResearchUploadModal() {
  const [open, setOpen] = useState(false);

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
                onClick={() => setOpen(false)}
                className="rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ResearchUploadForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
