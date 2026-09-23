import type { Request, Response } from 'express';
import { getAuth } from '../middleware/tenantScope';
import { authService } from '../services/auth.service';
import {
  createUserSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '../validators/auth.schemas';

export const authController = {
  async register(req: Request, res: Response) {
    const input = registerSchema.parse(req.body);
    res.status(201).json(await authService.register(input));
  },

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    res.json(await authService.login(input));
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json(await authService.refresh(refreshToken));
  },

  async me(req: Request, res: Response) {
    res.json(await authService.me(getAuth(req).userId));
  },

  async listUsers(_req: Request, res: Response) {
    res.json({ data: await authService.listUsers() });
  },

  async createUser(req: Request, res: Response) {
    const input = createUserSchema.parse(req.body);
    res.status(201).json(await authService.createUser(input));
  },
};
