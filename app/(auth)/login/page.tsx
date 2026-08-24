import { LoginForm } from "@/app/(auth)/login/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-ink">USC Garnet Fund</h1>
          <p className="mt-1 text-sm text-ink-2">Sign in to the dashboard</p>
        </div>
        {!isSupabaseConfigured && (
          <div className="rounded-none border border-warn-line bg-warn-soft px-3 py-2.5 text-[13.5px] text-warn">
            <p className="font-semibold">Supabase isn&rsquo;t configured</p>
            <p className="mt-1 text-warn">
              Sign-in is disabled locally until credentials are set. Add your keys to{" "}
              <code className="text-warn">.env.local</code> (see{" "}
              <code className="text-warn">.env.example</code>) and restart the dev server.
            </p>
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
