import { redirect } from "next/navigation";
import { LogoMark } from "@/components/dashboard/logo-mark";
import { requireProfile } from "@/lib/auth";
import { saveProfileNameAction } from "@/app/(auth)/onboarding/actions";

export default async function OnboardingPage() {
  const profile = await requireProfile();

  if (profile.first_name && profile.last_name) {
    redirect("/home");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-5 p-6">
        <LogoMark />
        <div>
          <p className="caps-label">Profile Setup</p>
          <h1 className="text-xl font-semibold text-white">Tell us your name</h1>
          <p className="text-sm text-zinc-400">
            Add your first and last name before accessing the dashboard.
          </p>
        </div>

        <form action={saveProfileNameAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-zinc-400">First Name</label>
            <input
              name="firstName"
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none placeholder:text-zinc-500"
              placeholder="First name"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-zinc-400">Last Name</label>
            <input
              name="lastName"
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none placeholder:text-zinc-500"
              placeholder="Last name"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
