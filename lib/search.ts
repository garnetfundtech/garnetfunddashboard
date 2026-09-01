import { getFundUsers, getResearchItems, getResourcesWithUrls, getWatchlistRows } from "@/lib/data";
import type { UserRole } from "@/lib/types";

const ROLE_SEARCH_TERMS: Record<UserRole, string> = {
  analyst: "analyst",
  faculty: "faculty advisor professor",
  pm: "pm lead",
  admin: "admin",
  developer: "developer dev",
};

export type SearchItemType = "user" | "research" | "resource" | "watchlist";

export type SearchItem = {
  id: string;
  type: SearchItemType;
  /** Primary line — name, title, or ticker. */
  label: string;
  /** Secondary line — what matched and where, e.g. "User" or "Research · AAPL". */
  subtitle: string;
  /** Raw fields checked against the query, kept separate from the display subtitle. */
  searchable: string;
  href: string;
};

/**
 * One flat index across every searchable entity in the app, built server-side
 * and handed to the client search bar. Filtering happens in the browser
 * against this list rather than round-tripping per keystroke — the whole
 * index is a few hundred rows at most, well within what a client filter
 * handles instantly.
 */
export async function getSearchIndex(): Promise<SearchItem[]> {
  const [users, research, resources, watchlist] = await Promise.all([
    getFundUsers().catch(() => []),
    getResearchItems().catch(() => []),
    getResourcesWithUrls().catch(() => []),
    getWatchlistRows().catch(() => []),
  ]);

  const items: SearchItem[] = [];

  for (const u of users) {
    items.push({
      id: u.id,
      type: "user",
      label: u.fullName,
      subtitle: "User",
      searchable: [u.fullName, ROLE_SEARCH_TERMS[u.role]].filter(Boolean).join(" "),
      href: `/users?highlight=${u.id}`,
    });
  }

  for (const r of research) {
    const ticker = r.ticker && r.ticker !== "—" ? r.ticker.toUpperCase() : null;
    items.push({
      id: r.id,
      type: "research",
      label: r.title,
      subtitle: ticker ? `Research · ${ticker}` : "Research",
      searchable: [r.title, r.ticker, r.analystName ?? r.author].filter(Boolean).join(" "),
      href: `/research?open=${r.id}`,
    });
  }

  for (const res of resources) {
    items.push({
      id: res.id,
      type: "resource",
      label: res.title,
      subtitle: "Resource",
      searchable: res.title,
      href: `/resources?open=${res.id}`,
    });
  }

  for (const w of watchlist) {
    items.push({
      id: w.id,
      type: "watchlist",
      label: w.ticker.toUpperCase(),
      subtitle: "Watchlist",
      searchable: [w.ticker, w.notes ?? ""].join(" "),
      href: "/watchlist",
    });
  }

  return items;
}
