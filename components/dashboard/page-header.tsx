"use client";

import type { ReactNode } from "react";
import { useRegisterPageHeader } from "@/components/dashboard/page-header-context";

/**
 * Registers this page's title/meta/actions into the shared layout row (see
 * page-header-context.tsx) instead of rendering its own header here — that
 * row sits at the same height and shares the same border line as the
 * sidebar's logo row, so every page's title lines up with it.
 */
export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  useRegisterPageHeader({ title, meta, actions });
  return null;
}
