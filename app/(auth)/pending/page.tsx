import { redirect } from "next/navigation";
import { LogoMark } from "@/components/dashboard/logo-mark";
import { logoutAction } from "@/app/(auth)/login/actions";
import { requireProfile } from "@/lib/auth";

// Deliberately requireProfile, not requireApprovedProfile — this is the page
// unapproved accounts are sent to, so gating it on approval would loop.
export default async function PendingPage() {
  const profile = await requireProfile();

  if (profile.status === "approved") {
    redirect("/home");
  }

  const rejected = profile.status === "rejected";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-5 p-6">
        <LogoMark />
        <div>
          <p className="caps-label">{rejected ? "Access Declined" : "Awaiting Approval"}</p>
          <h1 className="text-xl font-semibold text-ink">
            {rejected ? "Your request was declined" : "Your account is pending review"}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {rejected ? (
              <>
                An admin declined access for <span className="text-ink">{profile.email}</span>. If
                you think that&rsquo;s a mistake, reach out to a fund admin.
              </>
            ) : (
              <>
                We&rsquo;ve got your request for <span className="text-ink">{profile.email}</span>.
                An admin will review it shortly — sign back in once you hear that you&rsquo;re
                approved.
              </>
            )}
          </p>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-none border border-line px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
