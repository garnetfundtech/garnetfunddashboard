import type { UserRole } from "@/lib/types";

/** Routes shown in sidebar + used for page guards */
export const ROUTES = {
  home: "/home",
  users: "/users",
  research: "/research",
  resources: "/resources",
  admin: "/admin",
  orders: "/orders",
  pipeline: "/pipeline",
  watchlist: "/watchlist",
  earnings: "/earnings",
} as const;

const ANALYST_PATHS = new Set<string>([
  ROUTES.home,
  ROUTES.research,
  ROUTES.resources,
  ROUTES.watchlist,
  ROUTES.earnings,
  ROUTES.pipeline,
]);

const PM_EXTRA = new Set<string>([
  ROUTES.users,
  ROUTES.orders,
]);

export function getSidebarNavItems(role: UserRole): { href: string; label: string }[] {
  const all: { href: string; label: string }[] = [
    { href: ROUTES.home, label: "Home" },
    { href: ROUTES.users, label: "Users" },
    { href: ROUTES.research, label: "Research" },
    { href: ROUTES.resources, label: "Resources" },
    { href: ROUTES.orders, label: "Trade History" },
    { href: ROUTES.pipeline, label: "Pipeline" },
    { href: ROUTES.watchlist, label: "Watchlist" },
    { href: ROUTES.earnings, label: "Earnings" },
  ];

  return all.filter((item) => {
    if (ANALYST_PATHS.has(item.href)) return true;
    if (PM_EXTRA.has(item.href)) {
      return role === "pm" || role === "admin" || role === "developer";
    }
    return false;
  });
}

export function canAccessDashboardPath(role: UserRole, pathname: string): boolean {
  const base = pathname.split("?")[0] ?? pathname;
  if (base === ROUTES.admin) {
    return role === "admin" || role === "developer";
  }
  if (ANALYST_PATHS.has(base)) return true;
  if (PM_EXTRA.has(base)) {
    return role === "pm" || role === "admin" || role === "developer";
  }
  return false;
}
