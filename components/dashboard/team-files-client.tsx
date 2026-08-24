"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Download,
  ExternalLink,
  Folder,
  FolderPlus,
  Minus,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TableShell } from "@/components/dashboard/table-shell";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import { StatusPill, type Tone } from "@/components/dashboard/status-pill";
import { PdfViewer, usePdfPrint } from "@/components/dashboard/pdf-viewer";
import { canManageContent } from "@/lib/roles";
import { signFile } from "@/lib/sign-client";
import type { UserRole } from "@/lib/types";
import type { TeamBrowseData, TeamFileRow } from "@/lib/team-files";
import {
  createFolderAction,
  deleteFolderAction,
  deleteTeamFileAction,
  renameFolderAction,
  uploadTeamFileAction,
} from "@/app/(dashboard)/files/actions";

const ACTION_BTN =
  "flex w-full items-center justify-center gap-2 rounded-none bg-paper-2 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper-2";

function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function extOf(file: TeamFileRow) {
  return file.title.split(".").pop()?.toLowerCase() ?? "";
}

function isPdf(file: TeamFileRow) {
  return file.mimeType === "application/pdf" || extOf(file) === "pdf";
}

function typeChip(file: TeamFileRow) {
  const map: Record<string, Tone> = {
    pdf: "rose",
    xlsx: "emerald",
    xlsm: "emerald",
    xls: "emerald",
    csv: "emerald",
    docx: "blue",
    doc: "blue",
    pptx: "amber",
    mp4: "blue",
  };
  const ext = extOf(file);
  const tone = map[ext] ?? "neutral";
  return <StatusPill label={ext.toUpperCase() || "FILE"} tone={tone} dot={false} />;
}

type Dialog =
  | { kind: "new-folder" }
  | { kind: "rename-folder"; id: string; name: string }
  | { kind: "confirm-folder-delete"; id: string; name: string; fileCount: number }
  | { kind: "upload" }
  | null;

export function TeamFilesClient({
  data,
  sectors,
  actor,
}: {
  data: TeamBrowseData;
  sectors: string[];
  actor: { id: string; role: UserRole; sector: string | null };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<TeamFileRow | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const doPrint = usePdfPrint(opened?.viewUrl);

  const { sector, folderId, breadcrumb, folders, files, sectorFileCounts, canWrite } =
    data;

  function navigate(next: { team?: string; folder?: string | null }) {
    const params = new URLSearchParams();
    params.set("team", next.team ?? sector);
    const folder = next.folder === undefined ? folderId : next.folder;
    if (folder) params.set("folder", folder);
    startTransition(() => {
      router.push(`/files?${params.toString()}`);
    });
  }

  function closeDialog() {
    setDialog(null);
    setError("");
    setPickedFile(null);
  }

  /** Runs a server action and keeps the dialog open when it reports a problem. */
  function submit(
    action: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>,
    fd: FormData,
    onDone?: () => void,
  ) {
    setError("");
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeDialog();
      onDone?.();
      router.refresh();
    });
  }

  function canDeleteFile(file: TeamFileRow) {
    if (!canWrite) return false;
    return canManageContent({
      actorId: actor.id,
      actorRole: actor.role,
      ownerId: file.createdBy,
      ownerRole: file.uploaderRole,
    });
  }

  function openFile(file: TeamFileRow) {
    setCurrentPage(1);
    setTotalPages(null);
    setZoom(1);
    setOpened(file);
    void signFile("team-files", file.id).then(({ viewUrl, downloadUrl }) => {
      setOpened((current) =>
        current && current.id === file.id
          ? { ...current, viewUrl: viewUrl ?? undefined, downloadUrl: downloadUrl ?? undefined }
          : current,
      );
    });
  }

  const totalFiles = useMemo(
    () => Object.values(sectorFileCounts).reduce((a, b) => a + b, 0),
    [sectorFileCounts],
  );

  const teamsWithFiles = useMemo(
    () => Object.values(sectorFileCounts).filter((n) => n > 0).length,
    [sectorFileCounts],
  );

  const kpiTiles = [
    { label: "Files here", value: String(files.length), sub: "In this folder" },
    { label: "Subfolders", value: String(folders.length), sub: "In this folder" },
    {
      label: sector,
      value: String(sectorFileCounts[sector] ?? 0),
      sub: "Files on this team",
    },
    { label: "All teams", value: String(totalFiles), sub: "Files fund-wide" },
    {
      label: "Active teams",
      value: `${teamsWithFiles} / ${sectors.length}`,
      sub: "Teams with uploads",
    },
  ];

  const locationLabel =
    breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : sector;

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Team Workspace"
        meta={`${files.length} file${files.length === 1 ? "" : "s"} in ${locationLabel}`}
        actions={
          canWrite ? (
            <>
              <GhostBtn onClick={() => setDialog({ kind: "new-folder" })}>
                <FolderPlus className="h-3.5 w-3.5" />
                New folder
              </GhostBtn>
              <PrimaryBtn onClick={() => setDialog({ kind: "upload" })}>
                <Upload className="h-3.5 w-3.5" />
                Upload
              </PrimaryBtn>
            </>
          ) : (
            <span className="text-[13.5px] text-ink-3">
              Read-only, you cover{" "}
              {actor.sector ?? "no team yet"}
            </span>
          )
        }
      />

      <KpiRow tiles={kpiTiles} />

      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: "196px minmax(0,1fr)" }}>
        {/* Team rail */}
        <div className="panel flex h-full min-h-0 flex-col overflow-hidden">
          <div className="border-b border-line px-3 py-2">
            <span className="text-[15px] font-semibold text-ink">Teams</span>
          </div>
          <div className="flex-1 overflow-auto p-1.5">
            {sectors.map((s) => {
              const active = s === sector;
              const count = sectorFileCounts[s] ?? 0;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => navigate({ team: s, folder: null })}
                  className={`flex w-full items-center justify-between gap-2 rounded-none px-2 py-[7px] text-left text-[14px] transition ${
                    active
                      ? "bg-paper-2 text-ink"
                      : "text-ink-2 hover:bg-paper-3 hover:text-ink"
                  }`}
                >
                  <span className="truncate">{s}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s === actor.sector && <StatusPill label="Mine" tone="accent" dot={false} />}
                    <span className="tabular-nums text-[12px] text-ink-3">
                      {count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Folder browser */}
        <TableShell
          title={locationLabel}
          count={folders.length + files.length}
          actions={
            // At a team root the panel title already names the location, so the
            // breadcrumb only earns its space once you're inside a folder.
            breadcrumb.length > 0 ? (
              <nav className="flex items-center gap-0.5 text-[13px]">
                <button
                  type="button"
                  onClick={() => navigate({ folder: null })}
                  className="rounded-none px-1.5 py-[2px] text-ink-3 transition hover:bg-paper-2 hover:text-ink"
                >
                  {sector}
                </button>
                {breadcrumb.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-0.5">
                    <ChevronRight className="h-3 w-3 shrink-0 text-ink-3" />
                    <button
                      type="button"
                      onClick={() => navigate({ folder: crumb.id })}
                      className={`max-w-[160px] truncate rounded-none px-1.5 py-[2px] transition ${
                        i === breadcrumb.length - 1
                          ? "text-ink"
                          : "text-ink-3 hover:bg-paper-2 hover:text-ink"
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </nav>
            ) : null
          }
          footer={
            canWrite
              ? "Everyone can read every team. Only your team can add or remove files here."
              : `Viewing ${sector} as read-only. Ask an admin to assign you to this team to upload.`
          }
        >
          <table className={`w-full ${isPending ? "opacity-60" : ""}`}>
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-ink-3">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {folders.length === 0 && files.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-[13.5px] text-ink-3"
                  >
                    {canWrite
                      ? "Nothing here yet. Create a folder or upload a file."
                      : "This folder is empty."}
                  </td>
                </tr>
              )}

              {folders.map((folder) => (
                <tr
                  key={folder.id}
                  className="cursor-pointer border-b border-line transition hover:bg-paper-3"
                  onClick={() => navigate({ folder: folder.id })}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
                      <Folder className="h-3.5 w-3.5 shrink-0 text-ink-2" />
                      {folder.name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill label="Folder" tone="neutral" dot={false} />
                  </td>
                  <td className="px-3 py-2 text-[14px] text-ink-2">
                    {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}
                    {folder.folderCount > 0 && `, ${folder.folderCount} sub`}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">
                    {fmtDate(folder.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-[14px] text-ink-3">—</td>
                  <td className="px-3 py-2 text-right">
                    {canWrite && (
                      <span className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({
                              kind: "rename-folder",
                              id: folder.id,
                              name: folder.name,
                            });
                          }}
                          className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({
                              kind: "confirm-folder-delete",
                              id: folder.id,
                              name: folder.name,
                              fileCount: folder.fileCount,
                            });
                          }}
                          className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-neg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {files.map((file) => (
                <tr
                  key={file.id}
                  className="cursor-pointer border-b border-line last:border-b-0 transition hover:bg-paper-3"
                  onClick={() => openFile(file)}
                >
                  <td className="px-3 py-2 text-[14px] font-medium text-ink">
                    {file.title}
                  </td>
                  <td className="px-3 py-2">{typeChip(file)}</td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">
                    {fmtSize(file.fileSize)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[14px] text-ink-2">
                    {fmtDate(file.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-[14px] text-ink-2">
                    {file.uploaderName}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canDeleteFile(file) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const fd = new FormData();
                          fd.set("id", file.id);
                          submit(deleteTeamFileAction, fd, () => setOpened(null));
                        }}
                        disabled={isPending}
                        className="rounded-none p-1 text-ink-3 hover:bg-paper-2 hover:text-neg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>

      {/* Row-level action errors surface here since the table has no dialog. */}
      {error && !dialog && (
        <p className="rounded-none bg-neg-soft px-3 py-2 text-[13.5px] text-neg">
          {error}
        </p>
      )}

      {/* ── File preview ──────────────────────────────────────────────────── */}
      {opened && isPdf(opened) && (
        <div className="fixed inset-0 z-50 flex bg-ink/50 backdrop-blur-md">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
            <PdfViewer
              url={opened.viewUrl}
              scale={zoom}
              onLoadTotalPages={(n) => setTotalPages(n)}
              onPageChange={setCurrentPage}
            />
          </div>
          <div className="flex w-[min(380px,100vw)] shrink-0 flex-col p-4 pl-0">
            <div className="panel flex flex-1 flex-col min-h-0 overflow-hidden rounded-none">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="caps-label">{opened.sector}</p>
                    <h2 className="mt-0.5 text-base font-semibold leading-snug text-ink">
                      {opened.title}
                    </h2>
                  </div>
                  <button
                    onClick={() => setOpened(null)}
                    className="mt-0.5 shrink-0 rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Uploaded by</dt>
                    <dd className="font-medium text-ink">{opened.uploaderName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Date</dt>
                    <dd className="text-ink">{fmtDate(opened.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Size</dt>
                    <dd className="tabular-nums text-ink">
                      {fmtSize(opened.fileSize)}
                    </dd>
                  </div>
                  {totalPages !== null && (
                    <div className="flex justify-between">
                      <dt className="text-ink-3">Pages</dt>
                      <dd className="tabular-nums text-ink">
                        {currentPage} of {totalPages}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="shrink-0 space-y-2 border-t border-line p-5 pt-4">
                <div className="flex w-full gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))
                    }
                    className={ACTION_BTN}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="flex flex-1 items-center justify-center rounded-none bg-paper-2 px-3 py-2.5 text-sm tabular-nums text-ink">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))
                    }
                    className={ACTION_BTN}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {opened.downloadUrl && (
                  <a href={opened.downloadUrl} className={ACTION_BTN}>
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                )}
                <button type="button" onClick={() => doPrint()} className={ACTION_BTN}>
                  <Printer className="h-4 w-4" />
                  Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Non-PDF files (models, decks, docs) can't render inline — offer the file. */}
      {opened && !isPdf(opened) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6 backdrop-blur-md">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="caps-label">{opened.sector}</p>
                <h2 className="mt-0.5 text-base font-semibold leading-snug text-ink">
                  {opened.title}
                </h2>
              </div>
              <button
                onClick={() => setOpened(null)}
                className="mt-0.5 shrink-0 rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-3">Uploaded by</dt>
                <dd className="font-medium text-ink">{opened.uploaderName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Date</dt>
                <dd className="text-ink">{fmtDate(opened.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Size</dt>
                <dd className="tabular-nums text-ink">
                  {fmtSize(opened.fileSize)}
                </dd>
              </div>
            </dl>
            <div className="space-y-2">
              {opened.downloadUrl ? (
                <a href={opened.downloadUrl} className={ACTION_BTN}>
                  <Download className="h-4 w-4" />
                  Download
                </a>
              ) : (
                <p className="rounded-none bg-paper-2 px-3 py-2.5 text-[13.5px] text-ink-2">
                  {opened.downloadEnabled
                    ? "This file’s link couldn’t be generated. Reload the page and try again."
                    : "Download is disabled for this file."}
                </p>
              )}
              {opened.viewUrl && (
                <a
                  href={opened.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={ACTION_BTN}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in new tab
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── New folder ────────────────────────────────────────────────────── */}
      {dialog?.kind === "new-folder" && (
        <DialogShell
          kicker={locationLabel}
          title="New folder"
          onClose={closeDialog}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("sector", sector);
              if (folderId) fd.set("parentId", folderId);
              submit(createFolderAction, fd);
            }}
          >
            <input
              name="name"
              placeholder="Folder name (e.g. Apple)"
              required
              maxLength={80}
              autoFocus
              className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
            />
            <p className="text-[13px] text-ink-3">
              Creating inside <span className="text-ink">{locationLabel}</span>.
            </p>
            {error && <ErrorNote>{error}</ErrorNote>}
            <DialogActions
              onCancel={closeDialog}
              submitLabel={isPending ? "Creating…" : "Create"}
              disabled={isPending}
            />
          </form>
        </DialogShell>
      )}

      {/* ── Rename folder ─────────────────────────────────────────────────── */}
      {dialog?.kind === "rename-folder" && (
        <DialogShell kicker="Folder" title="Rename" onClose={closeDialog}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("id", dialog.id);
              submit(renameFolderAction, fd);
            }}
          >
            <input
              name="name"
              defaultValue={dialog.name}
              required
              maxLength={80}
              autoFocus
              className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <DialogActions
              onCancel={closeDialog}
              submitLabel={isPending ? "Saving…" : "Save"}
              disabled={isPending}
            />
          </form>
        </DialogShell>
      )}

      {/* ── Delete folder ─────────────────────────────────────────────────── */}
      {dialog?.kind === "confirm-folder-delete" && (
        <DialogShell kicker="Folder" title="Delete folder" onClose={closeDialog}>
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-ink">
              Delete <span className="font-semibold text-ink">{dialog.name}</span>?
              {dialog.fileCount > 0 && (
                <>
                  {" "}
                  This also permanently deletes{" "}
                  <span className="font-semibold text-neg">
                    {dialog.fileCount} file{dialog.fileCount === 1 ? "" : "s"}
                  </span>{" "}
                  and every subfolder inside it.
                </>
              )}{" "}
              This can&apos;t be undone.
            </p>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-none px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", dialog.id);
                  submit(deleteFolderAction, fd);
                }}
                className="inline-flex items-center gap-2 rounded-none bg-neg-soft px-4 py-2 text-sm font-medium text-neg transition-colors hover:bg-neg-soft disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </DialogShell>
      )}

      {/* ── Upload ────────────────────────────────────────────────────────── */}
      {dialog?.kind === "upload" && (
        <DialogShell kicker={locationLabel} title="Upload file" onClose={closeDialog}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("sector", sector);
              if (folderId) fd.set("folderId", folderId);
              submit(uploadTeamFileAction, fd);
            }}
          >
            <label className="glass-input flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center transition-colors hover:bg-paper-2">
              <Upload className="h-5 w-5 text-ink-2" />
              {pickedFile ? (
                <span className="text-sm text-ink">{pickedFile.name}</span>
              ) : (
                <span className="text-sm text-ink-2">
                  Click to select a file: model, memo, or deck
                </span>
              )}
              <span className="text-[12px] text-ink-3">Up to 20 MB</span>
              <input
                name="file"
                type="file"
                required
                className="hidden"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setPickedFile(next);
                  // Pre-fill the title from the filename so uploads aren't blocked
                  // on typing one; still editable below.
                  const titleInput =
                    e.currentTarget.form?.elements.namedItem("title");
                  if (
                    next &&
                    titleInput instanceof HTMLInputElement &&
                    !titleInput.value
                  ) {
                    titleInput.value = next.name;
                  }
                }}
              />
            </label>
            <input
              name="title"
              placeholder="Title"
              required
              className="glass-input w-full px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
            />
            <p className="text-[13px] text-ink-3">
              Uploading to <span className="text-ink">{locationLabel}</span>. Every
              member of the fund can read it.
            </p>
            {error && <ErrorNote>{error}</ErrorNote>}
            <DialogActions
              onCancel={closeDialog}
              submitLabel={isPending ? "Uploading…" : "Upload"}
              disabled={isPending || !pickedFile}
            />
          </form>
        </DialogShell>
      )}
    </div>
  );
}

function DialogShell({
  kicker,
  title,
  onClose,
  children,
}: {
  kicker: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-6 backdrop-blur-md">
      <div className="panel w-full max-w-sm p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="caps-label truncate">{kicker}</p>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-none p-1.5 text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-none bg-neg-soft px-3 py-2 text-[13.5px] text-neg">
      {children}
    </p>
  );
}

function DialogActions({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void;
  submitLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-none px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
      >
        Cancel
      </button>
      <PrimaryBtn type="submit" disabled={disabled}>
        {submitLabel}
                </PrimaryBtn>
    </div>
  );
}
