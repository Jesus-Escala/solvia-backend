import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { createRateLimiter, type RateLimiter } from '../lib/rateLimit';

/**
 * Limits requests per client IP with an in-memory sliding window. Responds with
 * `429 TOO_MANY_REQUESTS` (and a `Retry-After` header) once the limit is reached.
 */
export function rateLimit(options: { limit: number; windowMs: number }) {
  const limiter: RateLimiter = createRateLimiter(options);
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    if (!limiter.hit(key)) {
      res.setHeader('Retry-After', Math.ceil(limiter.retryAfterMs(key) / 1000).toString());
      throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many requests, please try again later');
    }
    next();
  };
}
