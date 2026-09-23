import { describe, expect, it } from 'vitest';
import { resolveGoogleSignIn } from '../src/domain/googleSignIn';

describe('resolveGoogleSignIn', () => {
  it('signs in a user already linked to the Google account', () => {
    expect(
      resolveGoogleSignIn({
        userByGoogleId: { id: 'u1' },
        userByEmail: { id: 'u1', googleId: 'g1' },
      }),
    ).toEqual({ type: 'sign_in', userId: 'u1' });
  });

  it('links an existing email/password account the first time it uses Google', () => {
    expect(
      resolveGoogleSignIn({ userByGoogleId: null, userByEmail: { id: 'u2', googleId: null } }),
    ).toEqual({
      type: 'link_and_sign_in',
      userId: 'u2',
    });
  });

  it('asks for the business name before creating a new account', () => {
    expect(resolveGoogleSignIn({ userByGoogleId: null, userByEmail: null })).toEqual({
      type: 'needs_registration',
    });
  });

  it('registers a new business when the name is provided', () => {
    expect(
      resolveGoogleSignIn({ userByGoogleId: null, userByEmail: null, businessName: 'Bodega Luz' }),
    ).toEqual({
      type: 'register',
    });
  });
});
