"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "@/app/(auth)/login/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form className="space-y-3" action={formAction}>
      <div className="space-y-1">
        <label className="text-sm text-zinc-400">University Email</label>
        <input
          name="email"
          type="email"
          className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none placeholder:text-zinc-500"
          placeholder="name@email.sc.edu"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-zinc-400">Password</label>
        <input
          name="password"
          type="password"
          className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none placeholder:text-zinc-500"
          placeholder="Enter password"
          required
        />
      </div>

      {state.error ? <p className="text-sm text-rose-400">{state.error}</p> : null}

      <Button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#8e0604] px-3 py-2 text-sm font-medium text-white hover:bg-[#770503]"
      >
        <Lock className="h-4 w-4" />
        {pending ? "Signing In..." : "Sign In"}
      </Button>
    </form>
  );
}
