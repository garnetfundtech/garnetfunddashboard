"use client";

import { useActionState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signupAction, type LoginState } from "@/app/(auth)/login/actions";

const initialState: LoginState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <form className="space-y-3" action={formAction}>
      <div className="grid grid-cols-2 gap-2">
        <input
          name="firstName"
          type="text"
          className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
          placeholder="First name"
          required
        />
        <input
          name="lastName"
          type="text"
          className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
          placeholder="Last name"
          required
        />
      </div>

      <input
        name="email"
        type="email"
        className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
        placeholder="yourname@email.sc.edu"
        required
      />
      <p className="text-xs text-ink-3">Use your USC email (@email.sc.edu)</p>

      <input
        name="password"
        type="password"
        className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
        placeholder="Create password"
        required
      />

      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-pos">{state.success}</p> : null}

      <Button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-none bg-garnet px-3 py-2 text-sm font-medium text-white hover:bg-garnet-hover"
      >
        <UserPlus className="h-4 w-4" />
        {pending ? "Creating..." : "Create Account"}
      </Button>

      <Link href="/login" className="block text-center text-xs text-ink-2 hover:text-ink">
        Already have an account? Sign in
      </Link>
    </form>
  );
}
