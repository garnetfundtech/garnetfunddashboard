import { redirect } from "next/navigation";
import { LogoMark } from "@/components/dashboard/logo-mark";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "@/app/(auth)/set-password/set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reached without a session — the invite link was never clicked, or expired.
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-5 p-6">
        <LogoMark />
        <div>
          <p className="caps-label">Finish Setup</p>
          <h1 className="text-xl font-semibold text-ink">Choose your password</h1>
          <p className="text-sm text-ink-2">
            You&rsquo;re signing in as <span className="text-ink">{user.email}</span>. Pick a password
            to finish setting up your Garnet Fund account.
          </p>
        </div>
        <SetPasswordForm />
      </div>
    </div>
  );
}
