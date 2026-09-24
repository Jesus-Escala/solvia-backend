import type { AccessRequestStatus, Prisma } from '@prisma/client';
import { basePrisma } from '../lib/prisma';

/**
 * Access requests from the landing page. They are not tenant-owned (the business does not exist
 * yet), so every query uses the unscoped client.
 */

export interface AccessRequestFilters {
  status?: AccessRequestStatus;
  search?: string;
}

function buildWhere(filters: AccessRequestFilters): Prisma.AccessRequestWhereInput {
  const where: Prisma.AccessRequestWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = (['businessName', 'contactName', 'email', 'phone'] as const).map((field) => ({
      [field]: { contains: filters.search, mode: 'insensitive' },
    }));
  }
  return where;
}

export const accessRequestRepository = {
  create(data: {
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    industry?: string | null;
    message?: string | null;
  }) {
    return basePrisma.accessRequest.create({ data });
  },

  pendingExistsForEmail(email: string) {
    return basePrisma.accessRequest
      .count({ where: { email, status: 'pending' } })
      .then((count) => count > 0);
  },

  /** Sorted by `orderBy` (newest first by default), then by id so pages never overlap. */
  findMany(
    filters: AccessRequestFilters,
    pagination: { page: number; pageSize: number },
    orderBy: {
      field: 'businessName' | 'contactName' | 'message' | 'status' | 'createdAt';
      dir: 'asc' | 'desc';
    } = {
      field: 'createdAt',
      dir: 'desc',
    },
  ) {
    const where = buildWhere(filters);
    return basePrisma.$transaction([
      basePrisma.accessRequest.findMany({
        where,
        orderBy: [
          orderBy.field === 'message'
            ? { message: { sort: orderBy.dir, nulls: 'last' } }
            : { [orderBy.field]: orderBy.dir },
          { id: 'asc' },
        ],
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      basePrisma.accessRequest.count({ where }),
    ]);
  },

  findById(id: string) {
    return basePrisma.accessRequest.findUnique({ where: { id } });
  },

  updateStatus(id: string, status: AccessRequestStatus) {
    return basePrisma.accessRequest.update({ where: { id }, data: { status } });
  },

  countPending() {
    return basePrisma.accessRequest.count({ where: { status: 'pending' } });
  },
};
