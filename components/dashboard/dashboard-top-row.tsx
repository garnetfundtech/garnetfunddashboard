"use client";

import { usePageHeaderContent } from "@/components/dashboard/page-header-context";
import { GlobalSearch } from "@/components/dashboard/global-search";
import type { SearchItem } from "@/lib/search";

/**
 * Row 1 shares its height and bottom border with the sidebar's logo row, so
 * the two lines run flush across the whole screen — the page title sits at
 * the same vertical center as the logo. Row 2 is the global search, which
 * doesn't need that alignment.
 */
export function DashboardTopRow({ searchIndex }: { searchIndex: SearchItem[] }) {
  const header = usePageHeaderContent();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-[49px] shrink-0 items-center justify-between gap-4 border-b border-line">
        <div className="flex items-baseline gap-2.5">
          <h1 className="page-title whitespace-nowrap">{header?.title ?? ""}</h1>
          {header?.meta && <span className="text-[13.5px] text-ink-3">{header.meta}</span>}
        </div>
        {header?.actions && <div className="flex shrink-0 items-center gap-1.5">{header.actions}</div>}
      </div>
      <GlobalSearch index={searchIndex} />
    </div>
  );
}
