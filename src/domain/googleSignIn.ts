export type GoogleSignInAction =
  | { type: 'sign_in'; userId: string }
  | { type: 'link_and_sign_in'; userId: string }
  | { type: 'register' }
  | { type: 'needs_registration' };

/**
 * Decides what a verified Google sign-in does:
 * - a user already linked to this Google account signs in;
 * - a user with the same (verified) email gets the Google account linked, then signs in;
 * - otherwise a new business is registered when its name was provided, or the client is asked
 *   for it first (`needs_registration`).
 */
export function resolveGoogleSignIn(input: {
  userByGoogleId: { id: string } | null;
  userByEmail: { id: string; googleId: string | null } | null;
  businessName?: string;
}): GoogleSignInAction {
  if (input.userByGoogleId) return { type: 'sign_in', userId: input.userByGoogleId.id };
  if (input.userByEmail) {
    return input.userByEmail.googleId
      ? { type: 'sign_in', userId: input.userByEmail.id }
      : { type: 'link_and_sign_in', userId: input.userByEmail.id };
  }
  return input.businessName ? { type: 'register' } : { type: 'needs_registration' };
}
