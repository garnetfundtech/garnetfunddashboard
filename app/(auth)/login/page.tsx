import { LogoMark } from "@/components/dashboard/logo-mark";
import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-5 p-6">
        <LogoMark />
        <div>
          <p className="caps-label">Private Access</p>
          <h1 className="text-xl font-semibold text-white">Sign in to Garnet Fund Dashboard</h1>
          <p className="text-sm text-zinc-400">
            Invite-only. Use the same email address that was invited to the platform.
          </p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
