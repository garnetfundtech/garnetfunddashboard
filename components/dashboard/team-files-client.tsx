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
import { GhostBtn } from "@/components/dashboard/buttons";
import { PdfViewer, usePdfPrint } from "@/components/dashboard/pdf-viewer";
import { canManageContent } from "@/lib/roles";
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
  "flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10";

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
  const map: Record<string, string> = {
    pdf: "bg-rose-500/15 text-rose-300",
    xlsx: "bg-emerald-500/15 text-emerald-300",
    xlsm: "bg-emerald-500/15 text-emerald-300",
    xls: "bg-emerald-500/15 text-emerald-300",
    csv: "bg-emerald-500/15 text-emerald-300",
    docx: "bg-blue-500/15 text-blue-300",
    doc: "bg-blue-500/15 text-blue-300",
    pptx: "bg-amber-500/15 text-amber-300",
    mp4: "bg-purple-500/15 text-purple-300",
  };
  const ext = extOf(file);
  const cls = map[ext] ?? "bg-white/[0.05] text-zinc-300";
  return (
    <span
      className={`rounded-[4px] px-1.5 py-[1px] text-[9.5px] font-bold uppercase ${cls}`}
    >
      {ext.toUpperCase() || "FILE"}
    </span>
  );
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
    <div className="flex flex-col gap-3">
      <PageHeader
        kicker="Team Files"
        title="Team Workspace"
        subtitle="Shared models, memos, and working files, organized by coverage team."
        actions={
          canWrite ? (
            <>
              <GhostBtn onClick={() => setDialog({ kind: "new-folder" })}>
                <FolderPlus className="h-3.5 w-3.5" />
                New folder
              </GhostBtn>
              <button
                onClick={() => setDialog({ kind: "upload" })}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#8e0604] px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#a80705]"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button>
            </>
          ) : (
            <span className="text-[11.5px] text-zinc-500">
              Read-only — you cover{" "}
              {actor.sector ?? "no team yet"}
            </span>
          )
        }
      />

      <KpiRow tiles={kpiTiles} />

      <div className="grid gap-2" style={{ gridTemplateColumns: "196px minmax(0,1fr)" }}>
        {/* Team rail */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="border-b border-white/[0.04] px-3 py-2">
            <span className="text-[13.5px] font-semibold text-white">Teams</span>
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
                  className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-[7px] text-left text-[12px] transition ${
                    active
                      ? "bg-white/[0.06] text-white"
                      : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
                  }`}
                >
                  <span className="truncate">{s}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s === actor.sector && (
                      <span className="rounded-[3px] bg-[#8e0604]/25 px-1 py-[1px] text-[8.5px] font-bold uppercase text-rose-300">
                        Mine
                      </span>
                    )}
                    <span className="tabular-nums text-[10.5px] text-zinc-500">
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
              <nav className="flex items-center gap-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => navigate({ folder: null })}
                  className="rounded-[5px] px-1.5 py-[2px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  {sector}
                </button>
                {breadcrumb.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-0.5">
                    <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />
                    <button
                      type="button"
                      onClick={() => navigate({ folder: crumb.id })}
                      className={`max-w-[160px] truncate rounded-[5px] px-1.5 py-[2px] transition ${
                        i === breadcrumb.length - 1
                          ? "text-white"
                          : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
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
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
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
                    className="px-3 py-12 text-center text-[11.5px] text-zinc-500"
                  >
                    {canWrite
                      ? "Nothing here yet — create a folder or upload a file."
                      : "This folder is empty."}
                  </td>
                </tr>
              )}

              {folders.map((folder) => (
                <tr
                  key={folder.id}
                  className="cursor-pointer border-b border-white/[0.025] transition hover:bg-white/[0.02]"
                  onClick={() => navigate({ folder: folder.id })}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 text-[12px] font-medium text-white">
                      <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      {folder.name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-[4px] bg-white/[0.05] px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-zinc-300">
                      Folder
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-zinc-400">
                    {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}
                    {folder.folderCount > 0 && `, ${folder.folderCount} sub`}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">
                    {fmtDate(folder.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-zinc-500">—</td>
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
                          className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
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
                          className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-rose-400"
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
                  className="cursor-pointer border-b border-white/[0.025] last:border-b-0 transition hover:bg-white/[0.02]"
                  onClick={() => openFile(file)}
                >
                  <td className="px-3 py-2 text-[12px] font-medium text-white">
                    {file.title}
                  </td>
                  <td className="px-3 py-2">{typeChip(file)}</td>
                  <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">
                    {fmtSize(file.fileSize)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[12px] text-zinc-400">
                    {fmtDate(file.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-zinc-400">
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
                        className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-rose-400"
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
        <p className="rounded-[8px] bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
          {error}
        </p>
      )}

      {/* ── File preview ──────────────────────────────────────────────────── */}
      {opened && isPdf(opened) && (
        <div className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <PdfViewer
              url={opened.viewUrl}
              scale={zoom}
              onLoadTotalPages={(n) => setTotalPages(n)}
              onPageChange={setCurrentPage}
            />
          </div>
          <div className="flex w-[min(380px,100vw)] shrink-0 flex-col p-4 pl-0">
            <div className="panel flex flex-1 flex-col min-h-0 overflow-hidden rounded-[16px]">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="caps-label">{opened.sector}</p>
                    <h2 className="mt-0.5 text-base font-semibold leading-snug text-white">
                      {opened.title}
                    </h2>
                  </div>
                  <button
                    onClick={() => setOpened(null)}
                    className="mt-0.5 shrink-0 rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Uploaded by</dt>
                    <dd className="font-medium text-white">{opened.uploaderName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Date</dt>
                    <dd className="text-zinc-300">{fmtDate(opened.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Size</dt>
                    <dd className="tabular-nums text-zinc-300">
                      {fmtSize(opened.fileSize)}
                    </dd>
                  </div>
                  {totalPages !== null && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Pages</dt>
                      <dd className="tabular-nums text-zinc-300">
                        {currentPage} of {totalPages}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="shrink-0 space-y-2 border-t border-white/[0.06] p-5 pt-4">
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
                  <span className="flex flex-1 items-center justify-center rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-sm tabular-nums text-zinc-300">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 backdrop-blur-md">
          <div className="panel w-full max-w-sm p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="caps-label">{opened.sector}</p>
                <h2 className="mt-0.5 text-base font-semibold leading-snug text-white">
                  {opened.title}
                </h2>
              </div>
              <button
                onClick={() => setOpened(null)}
                className="mt-0.5 shrink-0 rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Uploaded by</dt>
                <dd className="font-medium text-white">{opened.uploaderName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Date</dt>
                <dd className="text-zinc-300">{fmtDate(opened.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Size</dt>
                <dd className="tabular-nums text-zinc-300">
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
                <p className="rounded-[10px] bg-white/[0.04] px-3 py-2.5 text-[11.5px] text-zinc-400">
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
              className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            />
            <p className="text-[11px] text-zinc-500">
              Creating inside <span className="text-zinc-300">{locationLabel}</span>.
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
              className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
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
            <p className="text-[12.5px] leading-relaxed text-zinc-300">
              Delete <span className="font-semibold text-white">{dialog.name}</span>?
              {dialog.fileCount > 0 && (
                <>
                  {" "}
                  This also permanently deletes{" "}
                  <span className="font-semibold text-rose-300">
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
                className="rounded-[10px] px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
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
                className="inline-flex items-center gap-2 rounded-[10px] bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
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
            <label className="glass-input flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center transition-colors hover:bg-white/[0.06]">
              <Upload className="h-5 w-5 text-zinc-400" />
              {pickedFile ? (
                <span className="text-sm text-zinc-200">{pickedFile.name}</span>
              ) : (
                <span className="text-sm text-zinc-400">
                  Click to select a file — model, memo, or deck
                </span>
              )}
              <span className="text-[10.5px] text-zinc-500">Up to 20 MB</span>
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
              className="glass-input w-full px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            />
            <p className="text-[11px] text-zinc-500">
              Uploading to <span className="text-zinc-300">{locationLabel}</span> — every
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 backdrop-blur-md">
      <div className="panel w-full max-w-sm p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="caps-label truncate">{kicker}</p>
            <h2 className="text-base font-semibold text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-[8px] p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
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
    <p className="rounded-[8px] bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
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
        className="rounded-[10px] px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-[10px] bg-[#8e0604] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a80705] disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  );
}
