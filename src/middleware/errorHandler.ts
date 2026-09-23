import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { logger } from '../lib/logger';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function send(res: Response, status: number, body: ErrorBody['error']): void {
  res.status(status).json({ error: body } satisfies ErrorBody);
}

export function notFoundHandler(req: Request, res: Response): void {
  send(res, 404, { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` });
}

/** Centralized error handler: every error leaves the API as `{ error: { code, message, details? } }`. */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    send(res, error.statusCode, {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  if (error instanceof ZodError) {
    send(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      send(res, 409, {
        code: 'CONFLICT',
        message: 'A record with the same unique value already exists',
      });
      return;
    }
    if (error.code === 'P2025') {
      send(res, 404, { code: 'NOT_FOUND', message: 'Resource not found' });
      return;
    }
  }

  if (error instanceof MulterError) {
    send(res, 400, { code: 'UPLOAD_ERROR', message: error.message });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    send(res, 400, { code: 'INVALID_JSON', message: 'Malformed JSON body' });
    return;
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, error);
  send(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
}
