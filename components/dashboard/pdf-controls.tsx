"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export function PdfControls({
  title,
  viewUrl,
  downloadUrl,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  title: string;
  viewUrl?: string;
  downloadUrl?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const buttonClass =
    "glass-input inline-flex h-[30px] items-center justify-center rounded-none px-3 text-xs font-medium text-ink transition-colors hover:bg-paper-2";
  const disabledClass = "opacity-30 cursor-not-allowed hover:bg-transparent";

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => viewUrl && setOpen(true)}
          disabled={!viewUrl}
          className={`${buttonClass} ${!viewUrl ? disabledClass : ""}`}
        >
          View
        </button>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            disabled={!canEdit}
            className={`${buttonClass} ${!canEdit ? disabledClass : ""}`}
          >
            Edit
          </button>
        ) : null}

        {downloadUrl ? (
          <Link href={downloadUrl} className={buttonClass}>
            Download
          </Link>
        ) : (
          <span className={`${buttonClass} ${disabledClass}`}>Download</span>
        )}

        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete}
            className={`${buttonClass} ${!canDelete ? disabledClass : ""}`}
          >
            Delete
          </button>
        ) : null}
      </div>

      {open && viewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6">
          <div className="panel flex h-[85vh] w-full max-w-5xl flex-col p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-ink">{title}</p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe src={viewUrl} className="min-h-0 flex-1 rounded-none" title={title} />
          </div>
        </div>
      )}
    </>
  );
}
