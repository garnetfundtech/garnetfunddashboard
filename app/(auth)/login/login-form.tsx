"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "@/app/(auth)/login/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form className="space-y-3" action={formAction}>
      <div className="space-y-1">
        <label className="text-sm text-ink-2">Email</label>
        <input
          name="email"
          type="email"
          className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
          placeholder="name@example.com"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-ink-2">Password</label>
        <input
          name="password"
          type="password"
          className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
          placeholder="Enter password"
          required
        />
      </div>

      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}

      <Button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-none bg-garnet px-3 py-2 text-sm font-medium text-white hover:bg-garnet-hover"
      >
        <Lock className="h-4 w-4" />
        {pending ? "Signing In..." : "Sign In"}
      </Button>

      <Link href="/signup" className="block text-center text-xs text-ink-2 hover:text-ink">
        Need an account? Sign up
      </Link>
    </form>
  );
}
