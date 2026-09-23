import type { Request, Response } from 'express';
import { accessRequestService } from '../services/accessRequest.service';
import { createAccessRequestSchema } from '../validators/accessRequest.schemas';

/** Hidden form field that people never fill in; bots that do get a fake success. */
const HONEYPOT_FIELD = 'website';

function honeypotFilled(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const value = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null;
}

/** Unauthenticated endpoints used by the landing page. */
export const publicController = {
  async createAccessRequest(req: Request, res: Response) {
    if (honeypotFilled(req.body)) {
      res.status(201).json({ ok: true });
      return;
    }
    const input = createAccessRequestSchema.parse(req.body);
    res.status(201).json(await accessRequestService.submit(input));
  },
};
