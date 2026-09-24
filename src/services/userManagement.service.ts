import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { generateTemporaryPassword } from '../domain/temporaryPassword';
import {
  checkPasswordReset,
  checkUserChange,
  type UserChangeViolation,
} from '../domain/userManagement';
import { AppError } from '../errors/AppError';
import { userRepository } from '../repositories/user.repository';
import type { CreateTeamUserInput, UpdateTeamUserInput } from '../validators/user.schemas';
import { toTenantUserDto } from './dto';
import { planService } from './plan.service';

const VIOLATION_MESSAGES: Record<UserChangeViolation, string> = {
  CANNOT_MODIFY_SELF: 'You cannot change your own role or deactivate yourself',
  LAST_ADMIN: 'The business must keep at least one active admin',
};

function violation(code: UserChangeViolation, message = VIOLATION_MESSAGES[code]) {
  return new AppError(400, code, message);
}

function userNotFound() {
  return new AppError(404, 'USER_NOT_FOUND', 'User not found');
}

export function emailTaken() {
  return new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
}

/**
 * A random temporary password and its bcrypt hash. The plain value is returned to the caller
 * exactly once and never stored.
 */
export async function newTemporaryPassword() {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_SALT_ROUNDS);
  return { temporaryPassword, passwordHash };
}

/**
 * Team management of the current tenant. Runs inside a tenant context: tenant admins reach it
 * through the scoped `/users` routes and the platform backoffice wraps it in `runWithTenant`.
 * `actorId` is the tenant user performing the change, or null for a platform admin.
 */
export const userManagementService = {
  async list() {
    const users = await userRepository.list();
    return users.map(toTenantUserDto);
  },

  async create(input: CreateTeamUserInput) {
    if (await userRepository.emailExists(input.email)) throw emailTaken();
    await planService.assertCanAddUser();
    const { temporaryPassword, passwordHash } = await newTemporaryPassword();
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash,
    });
    return { user: toTenantUserDto(user), temporaryPassword };
  },

  async update(actorId: string | null, id: string, input: UpdateTeamUserInput) {
    const target = await userRepository.findManaged(id);
    if (!target) throw userNotFound();

    const activeAdmins = await userRepository.countActiveAdmins();
    const problem = checkUserChange({ actorId, target, changes: input, activeAdmins });
    if (problem) throw violation(problem);
    // Reactivating someone takes a seat of the plan again.
    if (input.active === true && !target.active) await planService.assertCanAddUser();

    return toTenantUserDto(await userRepository.update(id, input));
  },

  async resetPassword(actorId: string | null, id: string) {
    const target = await userRepository.findManaged(id);
    if (!target) throw userNotFound();

    const problem = checkPasswordReset({ actorId, targetId: id });
    if (problem) {
      throw violation(problem, 'Use change password to update your own password');
    }

    const { temporaryPassword, passwordHash } = await newTemporaryPassword();
    await userRepository.setTemporaryPassword(id, passwordHash);
    return { temporaryPassword };
  },
};
