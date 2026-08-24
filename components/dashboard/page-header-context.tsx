"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type HeaderContent = {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

type Ctx = {
  content: HeaderContent | null;
  setContent: (c: HeaderContent | null) => void;
};

const PageHeaderCtx = createContext<Ctx | null>(null);

/**
 * Lets each page's <PageHeader> push its title/meta/actions up into the
 * layout's top row, so the title can sit in the same row (and share the same
 * border line) as the sidebar logo, instead of each page rendering its own
 * separate bordered header lower down.
 */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<HeaderContent | null>(null);
  const pathname = usePathname();

  // Clear immediately on navigation so the outgoing page's title never lingers
  // into the next page, even for the one tick before the new page's own
  // effect fires.
  useEffect(() => {
    setContent(null);
  }, [pathname]);

  return <PageHeaderCtx.Provider value={{ content, setContent }}>{children}</PageHeaderCtx.Provider>;
}

/** Reads the currently-registered header content, for the layout's top row to render. */
export function usePageHeaderContent(): HeaderContent | null {
  const ctx = useContext(PageHeaderCtx);
  return ctx?.content ?? null;
}

/** Called by <PageHeader> to register this page's title/meta/actions. */
export function useRegisterPageHeader(content: HeaderContent) {
  const ctx = useContext(PageHeaderCtx);
  const { title, meta, actions } = content;
  const lastRef = useRef<HeaderContent | null>(null);

  useEffect(() => {
    if (!ctx) return;
    lastRef.current = { title, meta, actions };
    ctx.setContent(lastRef.current);
    return () => {
      // Only clear if we're still the registered content (avoids a race where
      // a newly-mounted page's cleanup fires after the old page unmounts).
      if (ctx.content === lastRef.current) ctx.setContent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx identity is stable from the provider
  }, [title, meta, actions]);
}
