import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

const client = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

/** Verifies Google Identity Services ID tokens ("Sign in with Google"). */
export const googleAuth = {
  isConfigured: () => client !== null,
  clientId: () => env.GOOGLE_CLIENT_ID ?? null,

  /** Checks signature, expiry and audience; only verified emails are accepted. */
  async verify(credential: string): Promise<GoogleProfile> {
    if (!client || !env.GOOGLE_CLIENT_ID) {
      throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured');
    }
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Invalid or expired Google credential');
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AppError(
        401,
        'GOOGLE_EMAIL_NOT_VERIFIED',
        'The Google account email is not verified',
      );
    }
    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name ?? payload.email.split('@')[0] ?? payload.email,
    };
  },
};
