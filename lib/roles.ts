import type { UserRole } from "@/lib/types";

const ROLE_RANK: Record<UserRole, number> = {
  analyst: 0,
  admin: 1,
  developer: 2,
};

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

