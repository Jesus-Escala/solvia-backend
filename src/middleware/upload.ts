import { AsyncResource } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export const ALLOWED_PROOF_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_PROOF_MIME_TYPES.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        new AppError(
          400,
          'INVALID_PROOF_TYPE',
          'Payment proof must be a JPEG, PNG, WEBP image or a PDF',
        ),
      );
    }
  },
}).single('proof');

/**
 * Accepts an optional `proof` file (multipart/form-data). Multer resumes the request from stream
 * callbacks, so `next` is bound to the current async context to preserve the tenant scope.
 */
export function optionalProofUpload(req: Request, res: Response, next: NextFunction): void {
  proofUpload(req, res, AsyncResource.bind(next));
}
