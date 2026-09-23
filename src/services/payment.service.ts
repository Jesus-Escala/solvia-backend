import { env } from '../config/env';
import { deriveReceivableStatus, outstandingAmount } from '../domain/receivableStatus';
import { AppError } from '../errors/AppError';
import { todayInTimezone } from '../lib/dates';
import { logger } from '../lib/logger';
import { formatMoney, toNumber } from '../lib/money';
import { prisma } from '../lib/prisma';
import { paymentRepository } from '../repositories/payment.repository';
import { receivableRepository } from '../repositories/receivable.repository';
import type { CreatePaymentInput } from '../validators/receivable.schemas';
import { toPaymentDto, toReceivableDto } from './dto';
import { receivableService } from './receivable.service';
import { statementService } from './statement.service';
import { storageService } from './storage.service';

const EPSILON = 0.005;

export interface UploadedProof {
  buffer: Buffer;
  mimetype: string;
}

export const paymentService = {
  /**
   * Registers a partial or full payment, updates the receivable balance and status atomically,
   * and then sends the customer an updated account statement in the background.
   */
  async register(receivableId: string, input: CreatePaymentInput, proof?: UploadedProof) {
    const receivable = await receivableService.findOrFail(receivableId);
    const outstanding = outstandingAmount({
      totalAmount: toNumber(receivable.totalAmount),
      paidAmount: toNumber(receivable.paidAmount),
    });

    if (outstanding <= 0) {
      throw AppError.unprocessable('This receivable is already fully paid');
    }
    if (input.amount > outstanding + EPSILON) {
      throw AppError.unprocessable(
        `Payment exceeds the outstanding balance of ${formatMoney(outstanding, env.CURRENCY)}`,
        { outstanding },
      );
    }

    const today = todayInTimezone(env.APP_TIMEZONE);
    const paymentDate = input.date ?? today;
    if (paymentDate.getTime() > today.getTime()) {
      throw AppError.badRequest('Payment date cannot be in the future');
    }

    const proofUrl = proof
      ? await storageService.savePaymentProof(proof.buffer, proof.mimetype)
      : null;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await paymentRepository.create(
        { receivableId, amount: input.amount, date: paymentDate, method: input.method, proofUrl },
        tx,
      );
      const incremented = await receivableRepository.update(
        receivableId,
        { paidAmount: { increment: input.amount } },
        tx,
      );

      const totalAmount = toNumber(incremented.totalAmount);
      const paidAmount = toNumber(incremented.paidAmount);
      if (paidAmount > totalAmount + EPSILON) {
        // Another payment was registered concurrently; roll back.
        throw AppError.conflict('Payment exceeds the outstanding balance');
      }

      const status = deriveReceivableStatus(
        { totalAmount, paidAmount, dueDate: incremented.dueDate },
        today,
      );
      const updated =
        status === incremented.status
          ? incremented
          : await receivableRepository.update(receivableId, { status }, tx);
      return { payment, receivable: updated };
    });

    // Fire-and-forget: statement delivery must not delay or fail the payment request.
    void statementService
      .sendStatement(receivable.customerId, receivableId)
      .catch((error: unknown) => logger.error('Automatic statement dispatch failed', error));

    return {
      payment: toPaymentDto(result.payment),
      receivable: toReceivableDto(result.receivable),
    };
  },

  async listByReceivable(receivableId: string) {
    await receivableService.findOrFail(receivableId);
    const payments = await paymentRepository.listByReceivable(receivableId);
    return payments.map(toPaymentDto);
  },
};
