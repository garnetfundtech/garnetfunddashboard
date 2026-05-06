import Link from "next/link";
import { Ban, Download, Search } from "lucide-react";
import { getResourcesWithUrls } from "@/lib/data";
import { ResourcesUploadModal } from "@/components/dashboard/resources-upload-modal";
import { ResourceViewButton } from "@/components/dashboard/resource-view-button";

export default async function ResourcesPage() {
  const resources = await getResourcesWithUrls();

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-3">
        <div className="glass-input flex flex-1 items-center gap-2 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
            placeholder="Search resources..."
          />
        </div>
        <select className="glass-input bg-transparent px-3 py-2.5 text-sm text-zinc-300 outline-none">
          <option value="">All categories</option>
          <option value="training">Training</option>
          <option value="pitch">Pitch</option>
          <option value="playbook">Playbook</option>
          <option value="research">Research</option>
        </select>
        <ResourcesUploadModal />
      </div>

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-left font-medium">Uploaded by</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">File</th>
            </tr>
          </thead>
          <tbody>
            {resources.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No resources yet. Upload the first one above.
                </td>
              </tr>
            ) : (
              resources.map((item) => (
                <tr key={item.id} className="odd:bg-white/[0.015]">
                  <td className="px-4 py-3 text-white">{item.title}</td>
                  <td className="px-4 py-3 capitalize text-white">{item.category}</td>
                  <td className="px-4 py-3 text-white">{item.uploadedBy}</td>
                  <td className="px-4 py-3 text-white">{item.updatedAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {item.viewUrl && (
                        <ResourceViewButton url={item.viewUrl} title={item.title} />
                      )}
                      {item.downloadEnabled && item.downloadUrl ? (
                        <Link
                          href={item.downloadUrl}
                          className="inline-flex items-center justify-center rounded-[7px] p-1.5 text-white transition-colors hover:bg-white/5"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Link>
                      ) : (
                        <Ban className="h-4 w-4 text-white opacity-30" />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
