"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPasswordAction } from "@/app/(auth)/set-password/actions";
import type { LoginState } from "@/app/(auth)/login/actions";

const initialState: LoginState = {};

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setPasswordAction, initialState);

  return (
    <form className="space-y-3" action={formAction}>
      <input
        name="password"
        type="password"
        autoComplete="new-password"
        className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
        placeholder="Create password"
        required
      />
      <input
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        className="glass-input w-full px-3 py-2 text-sm outline-none placeholder:text-ink-3"
        placeholder="Confirm password"
        required
      />
      <p className="text-xs text-ink-3">At least 8 characters.</p>

      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}

      <Button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-none bg-garnet px-3 py-2 text-sm font-medium text-white hover:bg-garnet-hover"
      >
        <KeyRound className="h-4 w-4" />
        {pending ? "Saving..." : "Set Password"}
      </Button>
    </form>
  );
}
