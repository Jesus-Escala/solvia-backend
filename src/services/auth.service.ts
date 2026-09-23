import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { tenantRepository } from '../repositories/tenant.repository';
import { userRepository } from '../repositories/user.repository';
import type { CreateUserInput, LoginInput, RegisterInput } from '../validators/auth.schemas';
import { issueTokens, verifyRefreshToken } from './token.service';

/** Real bcrypt hash used when the email is unknown, so login timing does not reveal accounts. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('solvia-dummy-password', 10);

function toSessionUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };
}

export const authService = {
  /** Registers a new business (tenant) together with its first admin user. */
  async register(input: RegisterInput) {
    if (await userRepository.emailExists(input.email)) {
      throw AppError.conflict('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
    const { tenant, user } = await tenantRepository.createWithAdmin({
      tenant: { name: input.businessName, industry: input.industry ?? null, plan: input.plan },
      admin: { name: input.name, email: input.email, passwordHash },
    });

    return {
      user: toSessionUser(user),
      tenant: { id: tenant.id, name: tenant.name, industry: tenant.industry, plan: tenant.plan },
      ...issueTokens(user),
    };
  },

  async login(input: LoginInput) {
    const user = await userRepository.findByEmailForAuth(input.email);
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      throw AppError.unauthorized('Invalid email or password');
    }
    return { user: toSessionUser(user), ...issueTokens(user) };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const user = await userRepository.findByIdForAuth(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User no longer exists');
    }
    return issueTokens(user);
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound('User');
    return user;
  },

  listUsers() {
    return userRepository.list();
  },

  async createUser(input: CreateUserInput) {
    if (await userRepository.emailExists(input.email)) {
      throw AppError.conflict('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
    return userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });
  },
};
