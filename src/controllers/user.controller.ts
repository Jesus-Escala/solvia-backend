import type { Request, Response } from 'express';
import { getAuth } from '../middleware/tenantScope';
import { userManagementService } from '../services/userManagement.service';
import { idParamSchema } from '../validators/common.schemas';
import { createTeamUserSchema, updateTeamUserSchema } from '../validators/user.schemas';

/** Team management by the business admin (current tenant). */
export const userController = {
  async list(_req: Request, res: Response) {
    res.json(await userManagementService.list());
  },

  async create(req: Request, res: Response) {
    const input = createTeamUserSchema.parse(req.body);
    res.status(201).json(await userManagementService.create(input));
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateTeamUserSchema.parse(req.body);
    res.json(await userManagementService.update(getAuth(req).userId, id, input));
  },

  async resetPassword(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await userManagementService.resetPassword(getAuth(req).userId, id));
  },
};
