import { randomInt } from 'node:crypto';

/**
 * Character sets for temporary passwords. Visually ambiguous characters (0/O/o, 1/l/I) are left
 * out because the password is read from the screen and typed by hand.
 */
export const TEMPORARY_PASSWORD_CHARSETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',
  digits: '23456789',
  special: '!@#$%*?',
} as const;

export const TEMPORARY_PASSWORD_LENGTH = 12;

const ALL_CHARACTERS = Object.values(TEMPORARY_PASSWORD_CHARSETS).join('');

const pick = (charset: string) => charset[randomInt(charset.length)]!;

/**
 * Generates a random temporary password (cryptographically secure) that always satisfies the
 * password policy: at least one uppercase letter, one lowercase letter, one digit and one special
 * character, with no ambiguous characters.
 */
export function generateTemporaryPassword(length = TEMPORARY_PASSWORD_LENGTH): string {
  const required = Object.values(TEMPORARY_PASSWORD_CHARSETS).map(pick);
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () =>
    pick(ALL_CHARACTERS),
  );
  const characters = [...required, ...rest];

  // Fisher-Yates shuffle so the required characters do not always lead.
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }
  return characters.join('');
}
