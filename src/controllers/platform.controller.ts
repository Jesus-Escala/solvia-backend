import type { Request, Response } from 'express';
import { getPlatformAuth } from '../middleware/authenticate';
import { platformService } from '../services/platform.service';
import { platformAuthService } from '../services/platformAuth.service';
import { idParamSchema } from '../validators/common.schemas';
import {
  listTenantsQuerySchema,
  platformLoginSchema,
  platformRefreshSchema,
  updateTenantSchema,
} from '../validators/platform.schemas';

export const platformController = {
  async login(req: Request, res: Response) {
    const input = platformLoginSchema.parse(req.body);
    res.json(await platformAuthService.login(input));
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = platformRefreshSchema.parse(req.body);
    res.json(await platformAuthService.refresh(refreshToken));
  },

  async me(req: Request, res: Response) {
    res.json(await platformAuthService.me(getPlatformAuth(req).adminId));
  },

  async overview(_req: Request, res: Response) {
    res.json(await platformService.overview());
  },

  async listTenants(req: Request, res: Response) {
    const query = listTenantsQuerySchema.parse(req.query);
    res.json(await platformService.listTenants(query));
  },

  async getTenant(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await platformService.getTenant(id));
  },

  async updateTenant(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateTenantSchema.parse(req.body);
    res.json(await platformService.updateTenant(id, input));
  },
};
