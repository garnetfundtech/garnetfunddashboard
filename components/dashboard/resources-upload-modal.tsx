"use client";

import { useRef, useState, useTransition } from "react";
import { FilePlus2, X, Upload, Ban, Download } from "lucide-react";
import { PrimaryBtn } from "@/components/dashboard/buttons";
import { recordResourceAction } from "@/app/(dashboard)/resources/actions";
import { MAX_UPLOAD_LABEL, checkUploadSize } from "@/lib/uploads";
import { uploadToStorage } from "@/lib/upload-client";

export function ResourcesUploadModal() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleClose() {
    setOpen(false);
    setFile(null);
    setDownloadEnabled(false);
    setError("");
    formRef.current?.reset();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = file ? checkUploadSize(file) : "Choose a file to upload.";
    if (problem) {
      setError(problem);
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("downloadEnabled", downloadEnabled ? "on" : "");
    const picked = file as File;
    setError("");

    startTransition(async () => {
      // Bytes go straight to storage; only the metadata comes back through
      // the server. See lib/upload-client.ts.
      const sent = await uploadToStorage({ kind: "resources", file: picked });
      if (!sent.ok) {
        setError(sent.error);
        return;
      }

      formData.set("grant", sent.grant);
      const result = await recordResourceAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      handleClose();
    });
  }

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
                <p className="caps-label">Resources</p>
                <h2 className="text-base font-semibold text-ink">Upload File</h2>
              </div>
              <button
                onClick={handleClose}
                className="rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

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
                placeholder="File title"
                required
                className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
              />

              {/* Category + Download toggle */}
              <div className="flex gap-3">
                <select
                  name="category"
                  className="glass-input flex-1 bg-transparent px-3 py-2.5 text-sm text-ink outline-none"
                >
                  <option value="training">Training</option>
                  <option value="pitch">Pitch</option>
                  <option value="playbook">Playbook</option>
                  <option value="research">Research</option>
                </select>
                <button
                  type="button"
                  onClick={() => setDownloadEnabled((v) => !v)}
                  className={`glass-input flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
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
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-none px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                >
                  Cancel
                </button>
                <PrimaryBtn type="submit" disabled={isPending || !file}>
                  {isPending ? "Uploading…" : "Upload"}
                </PrimaryBtn>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
