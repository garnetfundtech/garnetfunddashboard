/**
 * Coverage tickers — the names people say they cover — and the fund-wide file
 * lookup that hangs off them.
 *
 * Rows live in coverage_tickers (migration 0025) and are owned by whoever
 * added them. Everything here reads with the admin client and is exposed to
 * every signed-in user: the coverage map, and the files it points at, are
 * fund-wide by design. Write authorization lives in
 * app/(dashboard)/coverage/actions.ts and is mirrored by RLS in 0025.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { toCoverageTeam } from "@/lib/sectors";

export type CoverageTickerRow = {
  id: string;
  ticker: string;
  companyName: string | null;
  sector: string;
  analystId: string;
  createdAt: string;
};

/** One file anywhere in the fund that matched a ticker. */
export type TickerFile = {
  /** Matches the /api/files/sign source, so the client can open it. */
  source: "research" | "team-files";
  id: string;
  title: string;
  /** Where it lives, e.g. "Research" or "TMT / Apple". */
  location: string;
  addedBy: string;
  createdAt: string;
  downloadEnabled: boolean;
  /** The page this file lives on, for a "show me where" link. */
  href: string;
  /** Why it matched, so the panel can say so rather than looking magic. */
  matchedOn: "ticker" | "name";
};

export type TickerLookup = { ticker: string; companyName: string | null };

/** Ticker as a standalone word: "AAPL" hits "AAPL 10-K" but not "AAPLE". */
function tickerPattern(ticker: string) {
  const escaped = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, "i");
}

/**
 * Company names are matched as a substring, but only once they're long enough
 * to mean something — a two-letter name would match half the workspace.
 */
function matchesCompany(haystack: string, companyName: string | null) {
  if (!companyName) return false;
  const needle = companyName.trim().toLowerCase();
  if (needle.length < 3) return false;
  return haystack.toLowerCase().includes(needle);
}

/**
 * Whether a piece of text (a file title plus the folders above it) refers to a
 * ticker, and by which route. Exported because this rule is the whole contract
 * of the coverage file panel: a one-letter ticker like V must not drag in
 * every file with a "v" in it, so the symbol only counts as a standalone word.
 */
export function textMatchesTicker(
  haystack: string,
  ticker: string,
  companyName: string | null,
): "ticker" | "name" | null {
  if (tickerPattern(ticker.toUpperCase()).test(haystack)) return "ticker";
  if (matchesCompany(haystack, companyName)) return "name";
  return null;
}

export async function getCoverageTickers(): Promise<CoverageTickerRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coverage_tickers")
    .select("id,ticker,company_name,sector,analyst_id,created_at")
    .order("ticker");

  // Before migration 0025 has been applied the table doesn't exist yet. The
  // rest of /coverage still works without it, so degrade instead of throwing.
  if (error || !data) return [];

  return data.map((row) => {
    const r = row as {
      id: string;
      ticker: string;
      company_name: string | null;
      sector: string;
      analyst_id: string;
      created_at: string;
    };
    return {
      id: r.id,
      ticker: r.ticker.toUpperCase(),
      companyName: r.company_name,
      sector: toCoverageTeam(r.sector) ?? r.sector,
      analystId: r.analyst_id,
      createdAt: r.created_at,
    };
  });
}

/**
 * Every file in the fund that relates to each of `tickers`, keyed by ticker.
 *
 * Research posts match on their own ticker field; team workspace files match
 * on the ticker appearing in the file title or in any folder on its path (so
 * dropping a deck into a "Apple" folder surfaces it under AAPL), or on the
 * company name appearing there.
 *
 * Both tables are read whole and matched in memory. They hold hundreds of rows
 * fund-wide, not thousands, and one pass here beats a query per ticker.
 */
export async function getFilesByTicker(
  tickers: TickerLookup[],
): Promise<Record<string, TickerFile[]>> {
  const out: Record<string, TickerFile[]> = {};
  if (tickers.length === 0) return out;

  const admin = createAdminClient();
  const [researchRes, filesRes, foldersRes] = await Promise.all([
    admin
      .from("research_posts")
      .select(
        "id,title,ticker,company_name,sector,created_at,analyst_name,author_override,download_enabled",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("team_files")
      .select("id,title,sector,folder_id,created_at,uploader_name,download_enabled")
      .order("created_at", { ascending: false }),
    admin.from("team_folders").select("id,name,parent_id,sector"),
  ]);

  const research = (researchRes.data ?? []) as {
    id: string;
    title: string;
    ticker: string | null;
    company_name: string | null;
    sector: string | null;
    created_at: string;
    analyst_name: string | null;
    author_override: string | null;
    download_enabled: boolean | null;
  }[];

  const teamFiles = (filesRes.data ?? []) as {
    id: string;
    title: string;
    sector: string;
    folder_id: string | null;
    created_at: string;
    uploader_name: string | null;
    download_enabled: boolean | null;
  }[];

  const folders = (foldersRes.data ?? []) as {
    id: string;
    name: string;
    parent_id: string | null;
    sector: string;
  }[];

  const folderById = new Map(folders.map((f) => [f.id, f]));

  /** "TMT / Apple / Q3" for a folder, or just the team at a sector root. */
  function folderPath(sector: string, folderId: string | null) {
    const names: string[] = [];
    const seen = new Set<string>();
    let cursor = folderId;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const folder = folderById.get(cursor);
      if (!folder) break;
      names.unshift(folder.name);
      cursor = folder.parent_id;
    }
    return [sector, ...names].join(" / ");
  }

  for (const { ticker, companyName } of tickers) {
    const key = ticker.toUpperCase();
    if (out[key]) continue;

    const matches: TickerFile[] = [];

    for (const post of research) {
      const postTicker = (post.ticker ?? "").trim().toUpperCase();
      const byTicker = postTicker === key;
      const byName =
        !byTicker &&
        textMatchesTicker(
          `${post.title} ${post.company_name ?? ""}`,
          key,
          companyName,
        ) === "name";
      if (!byTicker && !byName) continue;

      matches.push({
        source: "research",
        id: post.id,
        title: post.title,
        location: post.sector ? `Research · ${post.sector}` : "Research",
        addedBy: post.analyst_name ?? post.author_override ?? "Unknown",
        createdAt: post.created_at,
        downloadEnabled: post.download_enabled ?? false,
        href: `/research?open=${post.id}`,
        matchedOn: byTicker ? "ticker" : "name",
      });
    }

    for (const file of teamFiles) {
      const path = folderPath(file.sector, file.folder_id);
      const haystack = `${file.title} ${path}`;
      const matchedOn = textMatchesTicker(haystack, key, companyName);
      if (!matchedOn) continue;

      const params = new URLSearchParams({ team: file.sector });
      if (file.folder_id) params.set("folder", file.folder_id);

      matches.push({
        source: "team-files",
        id: file.id,
        title: file.title,
        location: path,
        addedBy: file.uploader_name ?? "Unknown",
        createdAt: file.created_at,
        downloadEnabled: file.download_enabled ?? false,
        href: `/files?${params.toString()}`,
        matchedOn,
      });
    }

    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    out[key] = matches;
  }

  return out;
}
