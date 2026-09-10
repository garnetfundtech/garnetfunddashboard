"use client";

import { useRef, useState, useTransition } from "react";
import { FilePlus2, X, Upload, Ban, Download } from "lucide-react";
import { recordResearchAction } from "@/app/(dashboard)/research/actions";
import { COVERAGE_TEAMS } from "@/lib/sectors";
import { PrimaryBtn } from "@/components/dashboard/buttons";
import { MAX_UPLOAD_LABEL, checkUploadSize } from "@/lib/uploads";
import { uploadToStorage } from "@/lib/upload-client";

export function ResearchUploadForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Refuse an oversized file here rather than letting it reach the Server
    // Action, where Next rejects the whole request body and the user gets an
    // error page with a reference code instead of a reason. See lib/uploads.ts.
    const tooBig = file ? checkUploadSize(file) : "Choose a file to upload.";
    if (tooBig) {
      setError(tooBig);
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("downloadEnabled", String(downloadEnabled));
    const picked = file as File;
    const sector = String(formData.get("sector") ?? "");
    setError("");

    startTransition(async () => {
      // The PDF goes straight to storage; only its metadata comes back
      // through the server. See lib/upload-client.ts.
      const sent = await uploadToStorage({ kind: "research", file: picked, sector });
      if (!sent.ok) {
        setError(sent.error);
        return;
      }

      formData.set("grant", sent.grant);
      const result = await recordResearchAction(formData);
      // The form stays open holding what was typed when anything is refused.
      // It used to close and report success either way.
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setFile(null);
      setDownloadEnabled(false);
      onSuccess?.();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      {/* File picker */}
      <label className="glass-input flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center transition-colors hover:bg-paper-2">
        <Upload className="h-5 w-5 text-ink-2" />
        {file ? (
          <span className="text-sm text-ink">{file.name}</span>
        ) : (
          <span className="text-sm text-ink-2">Click to select a PDF</span>
        )}
        <span className="text-[12px] text-ink-3">PDF, up to {MAX_UPLOAD_LABEL}</span>
        <input
          name="file"
          type="file"
          accept="application/pdf"
          required
          className="hidden"
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            setFile(next);
            setError(next ? (checkUploadSize(next) ?? "") : "");
          }}
        />
      </label>

      {error && (
        <p className="border border-neg-line bg-neg-soft px-3 py-2 text-[13px] text-neg">
          {error}
        </p>
      )}

      {/* Title */}
      <input
        name="title"
        placeholder="Report title"
        required
        className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
      />

      {/* Ticker + Company Name */}
      <div className="flex gap-3">
        <input
          name="ticker"
          placeholder="Ticker"
          required
          className="glass-input w-28 shrink-0 px-3 py-2.5 text-sm uppercase text-ink outline-none placeholder:text-ink-3"
        />
        <input
          name="companyName"
          placeholder="Full company name"
          required
          className="glass-input flex-1 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
        />
      </div>

      {/* Sector dropdown */}
      <select
        name="sector"
        required
        defaultValue=""
        className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none"
      >
        <option value="" disabled>Select sector</option>
        {COVERAGE_TEAMS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Analyst name */}
      <input
        name="analystName"
        placeholder="Analyst name"
        required
        className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
      />

      {/* Download toggle */}
      <button
        type="button"
        onClick={() => setDownloadEnabled((v) => !v)}
        className={`glass-input flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
          downloadEnabled ? "text-ink" : "text-ink-3"
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
            className="rounded-none px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            Cancel
          </button>
        )}
        <PrimaryBtn type="submit" disabled={isPending || !file}>
          {isPending ? "Uploading…" : "Upload"}
                </PrimaryBtn>
      </div>
    </form>
  );
}

export function ResearchUploadModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PrimaryBtn onClick={() => setOpen(true)}>
        <FilePlus2 className="h-3.5 w-3.5" />
        Upload
      </PrimaryBtn>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="caps-label">Research</p>
                <h2 className="text-base font-semibold text-ink">Upload Report</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
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
