export type GoogleSignInAction =
  | { type: 'sign_in'; userId: string }
  | { type: 'link_and_sign_in'; userId: string }
  | { type: 'register' }
  | { type: 'needs_registration' }
  | { type: 'account_not_found' };

/**
 * Decides what a verified Google sign-in does:
 * - a user already linked to this Google account signs in;
 * - a user with the same (verified) email gets the Google account linked, then signs in;
 * - otherwise a new business is registered when its name was provided, or the client is asked
 *   for it first (`needs_registration`);
 * - when self sign-up is disabled, an unknown Google account is rejected (`account_not_found`).
 */
export function resolveGoogleSignIn(input: {
  userByGoogleId: { id: string } | null;
  userByEmail: { id: string; googleId: string | null } | null;
  businessName?: string;
  signupEnabled: boolean;
}): GoogleSignInAction {
  if (input.userByGoogleId) return { type: 'sign_in', userId: input.userByGoogleId.id };
  if (input.userByEmail) {
    return input.userByEmail.googleId
      ? { type: 'sign_in', userId: input.userByEmail.id }
      : { type: 'link_and_sign_in', userId: input.userByEmail.id };
  }
  if (!input.signupEnabled) return { type: 'account_not_found' };
  return input.businessName ? { type: 'register' } : { type: 'needs_registration' };
}
