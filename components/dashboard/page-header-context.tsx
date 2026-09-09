"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type HeaderContent = {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

/** What's actually stored: the content plus the route that registered it. */
type Registration = HeaderContent & { pathname: string };

type Ctx = {
  content: Registration | null;
  setContent: (update: (current: Registration | null) => Registration | null) => void;
};

const PageHeaderCtx = createContext<Ctx | null>(null);

/**
 * Lets each page's <PageHeader> push its title/meta/actions up into the
 * layout's top row, so the title can sit in the same row (and share the same
 * border line) as the sidebar logo, instead of each page rendering its own
 * separate bordered header lower down.
 *
 * Content is tagged with the pathname that registered it and read back only
 * for the current route, so the outgoing page's header can't linger into the
 * next one. This provider deliberately does NOT clear on navigation itself:
 * effects run children-first, so a clear here would land *after* the incoming
 * page registered and wipe it — leaving the row blank (no title, no Upload
 * button) until something happened to re-render that page.
 */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Registration | null>(null);

  return <PageHeaderCtx.Provider value={{ content, setContent }}>{children}</PageHeaderCtx.Provider>;
}

/** Reads the currently-registered header content, for the layout's top row to render. */
export function usePageHeaderContent(): HeaderContent | null {
  const ctx = useContext(PageHeaderCtx);
  const pathname = usePathname();
  const content = ctx?.content ?? null;
  return content && content.pathname === pathname ? content : null;
}

/** Called by <PageHeader> to register this page's title/meta/actions. */
export function useRegisterPageHeader(content: HeaderContent) {
  const ctx = useContext(PageHeaderCtx);
  const pathname = usePathname();
  const { title, meta, actions } = content;
  const setContent = ctx?.setContent;
  const lastRef = useRef<Registration | null>(null);

  useEffect(() => {
    if (!setContent) return;
    const entry: Registration = { pathname, title, meta, actions };
    lastRef.current = entry;
    setContent(() => entry);
    return () => {
      // Only clear if we're still the registered content, so a newly-mounted
      // page's registration survives the outgoing page's cleanup.
      setContent((current) => (current === entry ? null : current));
    };
  }, [setContent, pathname, title, meta, actions]);
}
