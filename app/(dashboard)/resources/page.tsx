import Link from "next/link";
import { Eye, FileStack } from "lucide-react";
import { getResourcesWithUrls } from "@/lib/data";
import { uploadResourceAction, toggleResourceDownloadAction } from "@/app/(dashboard)/resources/actions";
import { PdfViewer } from "@/components/dashboard/pdf-viewer";

export default async function ResourcesPage() {
  const resourceItems = await getResourcesWithUrls();
  const firstWithPreview = resourceItems.find((item) => item.viewUrl);

  return (
    <div className="space-y-3">
      <section className="panel p-4">
        <p className="caps-label">Resources</p>
        <h1 className="text-lg font-semibold text-white">Training Decks and Pitch Archive</h1>
        <p className="text-sm text-zinc-400">
          Every file supports in-app viewing. Download controls are managed per file.
        </p>
        <form action={uploadResourceAction} className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            name="title"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none md:col-span-2"
            placeholder="Resource title"
            required
          />
          <select
            name="category"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none"
          >
            <option value="training">Training</option>
            <option value="pitch">Pitch</option>
            <option value="playbook">Playbook</option>
            <option value="research">Research</option>
          </select>
          <label className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm">
            <input type="checkbox" name="downloadEnabled" />
            Download enabled
          </label>
          <input
            type="file"
            name="file"
            accept="application/pdf"
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-2 text-xs outline-none md:col-span-3"
            required
          />
          <button className="rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white">
            Upload PDF
          </button>
        </form>
      </section>

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel-soft)] text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-left font-medium">Updated</th>
              <th className="px-4 py-2 text-left font-medium">Permissions</th>
            </tr>
          </thead>
          <tbody>
            {resourceItems.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 text-white">{item.title}</td>
                <td className="px-4 py-3 capitalize text-zinc-300">{item.category}</td>
                <td className="px-4 py-3 text-zinc-400">{item.updatedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <span className="inline-flex items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-1">
                      <Eye className="h-3 w-3" /> View
                    </span>
                    {item.viewUrl ? (
                      <Link href={item.viewUrl} target="_blank" className="text-xs text-[#d88f8d] hover:underline">
                        Open
                      </Link>
                    ) : null}
                    {item.downloadEnabled ? (
                      <>
                        <span className="rounded-[8px] border border-emerald-700/40 bg-emerald-900/25 px-2 py-1 text-emerald-300">
                          Download enabled
                        </span>
                        {item.downloadUrl ? (
                          <Link href={item.downloadUrl} className="text-xs text-emerald-300 hover:underline">
                            Download
                          </Link>
                        ) : null}
                      </>
                    ) : (
                      <span className="rounded-[8px] border border-zinc-700 px-2 py-1 text-zinc-400">
                        View only
                      </span>
                    )}
                    <form action={toggleResourceDownloadAction}>
                      <input name="id" value={item.id} type="hidden" />
                      <input
                        name="downloadEnabled"
                        value={item.downloadEnabled ? "false" : "true"}
                        type="hidden"
                      />
                      <button className="rounded-[8px] border border-[var(--border)] px-2 py-1 text-xs text-zinc-300">
                        {item.downloadEnabled ? "Disable download" : "Enable download"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel p-4">
        <div className="flex items-start gap-2 text-zinc-400">
          <FileStack className="mt-0.5 h-4 w-4" />
          <p className="text-sm">
            PDF viewer is embedded in-app below with zoom and scroll controls.
          </p>
        </div>
      </section>

      <PdfViewer url={firstWithPreview?.viewUrl} />
    </div>
  );
}
