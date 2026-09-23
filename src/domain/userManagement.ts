import type { UserRole } from '@prisma/client';

export type UserChangeViolation = 'CANNOT_MODIFY_SELF' | 'LAST_ADMIN';

export interface ManagedUserState {
  id: string;
  role: UserRole;
  active: boolean;
}

export interface UserChanges {
  role?: UserRole;
  active?: boolean;
}

const isActiveAdmin = (user: { role: UserRole; active: boolean }) =>
  user.role === 'admin' && user.active;

/**
 * Validates a change to a team member:
 * - `CANNOT_MODIFY_SELF`: a user cannot change their own role or deactivate themselves
 *   (`actorId` is null for platform admins, who are not tenant users);
 * - `LAST_ADMIN`: a tenant must always keep at least one active admin.
 *
 * `activeAdmins` is the tenant's current number of active admins (the target included).
 */
export function checkUserChange(input: {
  actorId: string | null;
  target: ManagedUserState;
  changes: UserChanges;
  activeAdmins: number;
}): UserChangeViolation | null {
  const { actorId, target, changes } = input;
  const roleChanges = changes.role !== undefined && changes.role !== target.role;
  const deactivates = changes.active === false && target.active;

  if (actorId === target.id && (roleChanges || deactivates)) {
    return 'CANNOT_MODIFY_SELF';
  }

  const after = { role: changes.role ?? target.role, active: changes.active ?? target.active };
  if (isActiveAdmin(target) && !isActiveAdmin(after) && input.activeAdmins <= 1) {
    return 'LAST_ADMIN';
  }
  return null;
}

/** Users reset other members' passwords; their own goes through change-password instead. */
export function checkPasswordReset(input: {
  actorId: string | null;
  targetId: string;
}): UserChangeViolation | null {
  return input.actorId === input.targetId ? 'CANNOT_MODIFY_SELF' : null;
}
