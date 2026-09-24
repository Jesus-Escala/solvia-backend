import { AppError } from '../errors/AppError';
import { accessRequestRepository } from '../repositories/accessRequest.repository';
import type {
  CreateAccessRequestInput,
  ListAccessRequestsQuery,
  UpdateAccessRequestInput,
} from '../validators/accessRequest.schemas';
import { paginate } from '../validators/common.schemas';
import { toAccessRequestDto } from './dto';

export function accessRequestNotFound() {
  return new AppError(404, 'ACCESS_REQUEST_NOT_FOUND', 'Access request not found');
}

export function accessRequestConverted() {
  return new AppError(
    400,
    'ACCESS_REQUEST_CONVERTED',
    'This access request was already converted into a business',
  );
}

/** "Request access" submissions (landing page) and their review in the platform backoffice. */
export const accessRequestService = {
  /**
   * Stores a request from the landing page. A second request while one with the same email is
   * still pending is accepted silently, so the form never reveals which emails already applied.
   */
  async submit(input: CreateAccessRequestInput) {
    if (!(await accessRequestRepository.pendingExistsForEmail(input.email))) {
      await accessRequestRepository.create(input);
    }
    return { ok: true as const };
  },

  async list(query: ListAccessRequestsQuery) {
    const [rows, total] = await accessRequestRepository.findMany(
      { status: query.status, search: query.search },
      query,
      { field: query.sortBy, dir: query.sortDir },
    );
    return paginate(rows.map(toAccessRequestDto), total, query);
  },

  async updateStatus(id: string, input: UpdateAccessRequestInput) {
    const request = await accessRequestRepository.findById(id);
    if (!request) throw accessRequestNotFound();
    if (request.status === 'converted') throw accessRequestConverted();
    return toAccessRequestDto(await accessRequestRepository.updateStatus(id, input.status));
  },

  /** Fails unless the request exists and can still be converted into a business. */
  async assertConvertible(id: string) {
    const request = await accessRequestRepository.findById(id);
    if (!request) throw accessRequestNotFound();
    if (request.status === 'converted') throw accessRequestConverted();
  },

  countPending() {
    return accessRequestRepository.countPending();
  },
};
