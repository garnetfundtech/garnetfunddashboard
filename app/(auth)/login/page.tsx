import { LoginForm } from "@/app/(auth)/login/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">USC Garnet Fund</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign in to the dashboard</p>
        </div>
        {!isSupabaseConfigured && (
          <div className="rounded-[10px] border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 text-[12px] text-amber-200/90">
            <p className="font-semibold">Supabase isn&rsquo;t configured</p>
            <p className="mt-1 text-amber-200/70">
              Sign-in is disabled locally until credentials are set. Add your keys to{" "}
              <code className="text-amber-100">.env.local</code> (see{" "}
              <code className="text-amber-100">.env.example</code>) and restart the dev server.
            </p>
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
