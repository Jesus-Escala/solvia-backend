import type { TenantStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { tenantRepository } from '../repositories/tenant.repository';
import { userRepository } from '../repositories/user.repository';
import { resolveGoogleSignIn } from '../domain/googleSignIn';
import type {
  ChangePasswordInput,
  GoogleSignInInput,
  LoginInput,
  RegisterInput,
} from '../validators/auth.schemas';
import { googleAuth } from './google.service';
import { issueTokens, verifyRefreshToken } from './token.service';

/** Real bcrypt hash used when the email is unknown, so login timing does not reveal accounts. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('solvia-dummy-password', 10);

interface SessionUserSource {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  mustChangePassword: boolean;
}

function toSessionUser(user: SessionUserSource) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * Inactive users and users of a suspended business cannot sign in or refresh their session.
 * Call it only after the credentials were verified, so it never reveals whether an email exists.
 */
function assertCanSignIn(user: { active: boolean; tenant: { status: TenantStatus } }) {
  if (!user.active) {
    throw new AppError(403, 'USER_DISABLED', 'This user is disabled');
  }
  if (user.tenant.status === 'suspended') {
    throw new AppError(403, 'TENANT_SUSPENDED', 'This business is suspended');
  }
}

function invalidCredentials() {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
}

/** Records the sign-in and returns the session (user + token pair). */
async function signIn(user: SessionUserSource & { active: boolean }) {
  const signedIn = await userRepository.touchLastLogin(user.id);
  return { user: toSessionUser(signedIn), ...issueTokens(signedIn) };
}

export const authService = {
  /** Registers a new business (tenant) together with its first admin user. */
  async register(input: RegisterInput) {
    if (!env.SELF_SIGNUP_ENABLED) {
      throw new AppError(403, 'SIGNUP_DISABLED', 'Self sign-up is disabled');
    }
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
    if (!user || !valid) throw invalidCredentials();
    assertCanSignIn(user);
    return signIn(user);
  },

  /**
   * "Sign in with Google": signs in (linking the Google account to an existing email if needed)
   * or, when self sign-up is enabled, creates the business for a new email once its name is
   * provided.
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
      signupEnabled: env.SELF_SIGNUP_ENABLED,
    });

    switch (action.type) {
      case 'account_not_found':
        throw new AppError(
          403,
          'GOOGLE_ACCOUNT_NOT_FOUND',
          'No Solvia account uses this Google email',
        );
      case 'needs_registration':
        return {
          needsRegistration: true as const,
          profile: { email: profile.email, name: profile.name },
        };
      case 'link_and_sign_in': {
        assertCanSignIn(userByEmail!);
        const user = await userRepository.linkGoogleAccount(action.userId, profile.googleId);
        return signIn(user);
      }
      case 'sign_in': {
        const user = (userByGoogleId ?? userByEmail)!;
        assertCanSignIn(user);
        return signIn(user);
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
        const signedIn = await userRepository.touchLastLogin(user.id);
        return {
          user: toSessionUser(signedIn),
          tenant: {
            id: tenant.id,
            name: tenant.name,
            industry: tenant.industry,
            plan: tenant.plan,
          },
          ...issueTokens(signedIn),
        };
      }
    }
  },

  /** Public auth configuration for the web app (which sign-in methods are available). */
  config() {
    return { googleClientId: googleAuth.clientId(), signupEnabled: env.SELF_SIGNUP_ENABLED };
  },

  /** Issues a new token pair; re-reads the user so role and password flags are current. */
  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const user = await userRepository.findByIdForAuth(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User no longer exists');
    }
    assertCanSignIn(user);
    return issueTokens(user);
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound('User');
    return user;
  },

  /**
   * Replaces the caller's password (required after receiving a temporary one) and returns a
   * fresh session whose access token no longer carries the "password change required" claim.
   * Google-only accounts (no password yet) may omit the current password.
   */
  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await userRepository.findByIdForAuth(userId);
    if (!user) throw AppError.unauthorized('User no longer exists');

    if (user.passwordHash !== null) {
      const valid =
        input.currentPassword !== undefined &&
        (await bcrypt.compare(input.currentPassword, user.passwordHash));
      if (!valid) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'The current password is incorrect');
      }
      if (input.newPassword === input.currentPassword) {
        throw new AppError(
          400,
          'PASSWORD_REUSED',
          'The new password must be different from the current one',
        );
      }
    }
    assertCanSignIn(user);

    const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS);
    const updated = await userRepository.changePassword(user.id, passwordHash);
    return { user: toSessionUser(updated), ...issueTokens(updated) };
  },
};
