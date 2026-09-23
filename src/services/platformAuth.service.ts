import bcrypt from 'bcrypt';
import { AppError } from '../errors/AppError';
import { platformAdminRepository } from '../repositories/platformAdmin.repository';
import type { LoginInput } from '../validators/auth.schemas';
import { issuePlatformTokens, verifyPlatformRefreshToken } from './token.service';

/** Real bcrypt hash used when the email is unknown, so login timing does not reveal accounts. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('solvia-dummy-password', 10);

function toAdminDto(admin: { id: string; email: string; name: string }) {
  return { id: admin.id, email: admin.email, name: admin.name };
}

/** Authentication of platform (backoffice) administrators. */
export const platformAuthService = {
  async login(input: LoginInput) {
    const admin = await platformAdminRepository.findByEmail(input.email);
    const valid = await bcrypt.compare(input.password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!admin || !valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    await platformAdminRepository.touchLastLogin(admin.id);
    return { ...issuePlatformTokens(admin), admin: toAdminDto(admin) };
  },

  async refresh(refreshToken: string) {
    const payload = verifyPlatformRefreshToken(refreshToken);
    const admin = await platformAdminRepository.findById(payload.sub);
    if (!admin) {
      throw AppError.unauthorized('Administrator no longer exists');
    }
    return issuePlatformTokens(admin);
  },

  async me(adminId: string) {
    const admin = await platformAdminRepository.findById(adminId);
    if (!admin) throw AppError.unauthorized('Administrator no longer exists');
    return { admin: toAdminDto(admin) };
  },
};
