import type { UserRole } from "@/lib/types";

const ROLE_RANK: Record<UserRole, number> = {
  // Faculty sit alongside analysts rather than above them: advisors observe
  // the fund, they don't moderate students' research or files.
  faculty: 0,
  analyst: 0,
  pm: 1,
  // The Risk Manager sits with the administrators rather than level with the
  // PMs.
  //
  // This reverses the earlier reading of Gov. III.b, which put them at PM
  // rank on the grounds that their authority is "over limits and approvals,
  // not over the PMs' research or files". The fund's decision is that the
  // Risk Manager is an administrator of the platform in every respect except
  // the membership itself — see canAdministerContent below for the line.
  risk_manager: 2,
  admin: 2,
  developer: 3,
};

/**
 * Administrative reach over the fund's content and configuration: resources,
 * any team's files, anyone's coverage, the watchlist, and the integration
 * health panel on /admin.
 *
 * Deliberately wider than canAdministerUsers. The Risk Manager is included
 * here and excluded there, which is the whole of the distinction the fund
 * asked for: they can run the platform, but they cannot change who is on it.
 */
const CONTENT_ADMIN_ROLES: UserRole[] = ["risk_manager", "admin", "developer"];

/**
 * Authority over people: approving a signup, setting someone's role, team or
 * class year, inviting, revoking and deleting.
 *
 * Kept to admin/developer on purpose. Membership decisions are the one thing
 * the Risk Manager's expanded remit does not cover, so this list must not
 * quietly grow to match the one above — every gate that changes a
 * user_profiles row belongs here.
 */
const USER_ADMIN_ROLES: UserRole[] = ["admin", "developer"];

/** May administer content and configuration, but not necessarily people. */
export function canAdministerContent(role: UserRole) {
  return CONTENT_ADMIN_ROLES.includes(role);
}

/** May change who is in the fund and what they are. */
export function canAdministerUsers(role: UserRole) {
  return USER_ADMIN_ROLES.includes(role);
}

export function isRoleHigher(actor: UserRole, target: UserRole) {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

export function canManageContent({
  actorId,
  actorRole,
  ownerId,
  ownerRole,
}: {
  actorId: string;
  actorRole: UserRole;
  ownerId: string | null;
  ownerRole: UserRole;
}) {
  if (ownerId && actorId === ownerId) return true;
  return isRoleHigher(actorRole, ownerRole);
}
