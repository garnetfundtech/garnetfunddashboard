import { requireApprovedProfile } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { updateOwnNameAction } from "@/app/(dashboard)/settings/actions";

const ROLE_LABEL: Record<string, string> = {
  analyst: "Analyst",
  faculty: "Faculty",
  pm: "Lead",
  admin: "Admin",
  developer: "Developer",
};

export default async function SettingsPage() {
  const profile = await requireApprovedProfile();

  return (
    <div className="space-y-3">
      <PageHeader title="Settings" meta={profile.email} />

      <section className="panel max-w-lg space-y-4 p-4">
        <div>
          <h2 className="panel-title">Your name</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Shown on research you post and in the member directory.
          </p>
        </div>

        <form action={updateOwnNameAction} className="space-y-3">
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="caps">First name</span>
              <input
                name="firstName"
                defaultValue={profile.first_name ?? ""}
                required
                className="border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="caps">Last name</span>
              <input
                name="lastName"
                defaultValue={profile.last_name ?? ""}
                required
                className="border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-none bg-garnet px-3 py-2 text-sm font-medium text-white hover:bg-garnet-hover"
          >
            Save
          </button>
        </form>
      </section>

      <section className="panel max-w-lg space-y-3 p-4">
        <div>
          <h2 className="panel-title">Account</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Contact an admin to change your role or coverage sector.
          </p>
        </div>
        <dl className="space-y-2 text-[13.5px]">
          <div className="flex justify-between border-b border-line pb-2">
            <dt className="text-ink-3">Email</dt>
            <dd className="text-ink">{profile.email}</dd>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <dt className="text-ink-3">Role</dt>
            <dd className="text-ink">{ROLE_LABEL[profile.role] ?? profile.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Coverage sector</dt>
            <dd className="text-ink">{profile.coverage_sector ?? "Unassigned"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
