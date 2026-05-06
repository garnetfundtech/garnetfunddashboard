import { getResourcesWithUrls } from "@/lib/data";
import { uploadResourceAction } from "@/app/(dashboard)/resources/actions";
import { ResourcesTableClient } from "@/components/dashboard/resources-table-client";

export default async function ResourcesPage() {
  const resourceItems = await getResourcesWithUrls();

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Resources</h1>
        <form action={uploadResourceAction} className="flex items-center gap-2">
          <input
            name="title"
            className="glass-input px-3 py-2 text-sm outline-none"
            placeholder="Resource title"
            required
          />
          <select name="category" className="glass-input px-3 py-2 text-sm outline-none">
            <option value="training">Training</option>
            <option value="pitch">Pitch</option>
            <option value="playbook">Playbook</option>
            <option value="research">Research</option>
          </select>
          <label className="glass-input flex items-center gap-2 px-3 py-2 text-xs">
            <input type="checkbox" name="downloadEnabled" />
            Download
          </label>
          <input type="file" name="file" accept="application/pdf" className="glass-input px-2 py-2 text-xs" required />
          <button className="rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white">
            Upload
          </button>
        </form>
      </div>

      <ResourcesTableClient resources={resourceItems} />

      <section className="panel p-3">
        <p className="text-xs text-zinc-400">
          Download permissions can be toggled in Account Admin.
        </p>
      </section>
    </div>
  );
}
