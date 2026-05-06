import { SignupForm } from "@/app/(auth)/signup/signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">USC Garnet Fund</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign up for the dashboard</p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
