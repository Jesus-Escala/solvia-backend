import type { TenantStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { tenantRepository } from '../repositories/tenant.repository';
import { userRepository } from '../repositories/user.repository';
import { resolveGoogleSignIn } from '../domain/googleSignIn';
import type {
  CreateUserInput,
  GoogleSignInInput,
  LoginInput,
  RegisterInput,
} from '../validators/auth.schemas';
import { googleAuth } from './google.service';
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

/** Users of a suspended business cannot sign in or refresh their session. */
function assertTenantActive(user: { tenant: { status: TenantStatus } }) {
  if (user.tenant.status === 'suspended') {
    throw new AppError(403, 'TENANT_SUSPENDED', 'This business is suspended');
  }
}

export const authService = {
  /** Registers a new business (tenant) together with its first admin user. */
  async register(input: RegisterInput) {
    if (await userRepository.emailExists(input.email)) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
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
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    assertTenantActive(user);
    return { user: toSessionUser(user), ...issueTokens(user) };
  },

  /**
   * "Sign in with Google": signs in (linking the Google account to an existing email if needed)
   * or, for a new email, creates the business once its name is provided.
   */
  async googleSignIn(input: GoogleSignInInput) {
    const profile = await googleAuth.verify(input.credential);
    const [userByGoogleId, userByEmail] = await Promise.all([
      userRepository.findByGoogleIdForAuth(profile.googleId),
      userRepository.findByEmailForAuth(profile.email),
    ]);
    const action = resolveGoogleSignIn({
      userByGoogleId,
      userByEmail,
      businessName: input.businessName,
    });

    switch (action.type) {
      case 'needs_registration':
        return {
          needsRegistration: true as const,
          profile: { email: profile.email, name: profile.name },
        };
      case 'link_and_sign_in': {
        assertTenantActive(userByEmail!);
        const user = await userRepository.linkGoogleAccount(action.userId, profile.googleId);
        return { user: toSessionUser(user), ...issueTokens(user) };
      }
      case 'sign_in': {
        const user = (userByGoogleId ?? userByEmail)!;
        assertTenantActive(user);
        return { user: toSessionUser(user), ...issueTokens(user) };
      }
      case 'register': {
        const { tenant, user } = await tenantRepository.createWithAdmin({
          tenant: { name: input.businessName!, industry: input.industry ?? null, plan: 'free' },
          admin: {
            name: profile.name,
            email: profile.email,
            passwordHash: null,
            googleId: profile.googleId,
          },
        });
        return {
          user: toSessionUser(user),
          tenant: {
            id: tenant.id,
            name: tenant.name,
            industry: tenant.industry,
            plan: tenant.plan,
          },
          ...issueTokens(user),
        };
      }
    }
  },

  /** Public auth configuration for the web app (which sign-in methods are available). */
  config() {
    return { googleClientId: googleAuth.clientId() };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const user = await userRepository.findByIdForAuth(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User no longer exists');
    }
    assertTenantActive(user);
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
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
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
