import type { Request, Response } from 'express';
import { env } from '../config/env';
import { todayInTimezone } from '../lib/dates';
import { getPlatformAuth } from '../middleware/authenticate';
import { accessRequestService } from '../services/accessRequest.service';
import { platformService } from '../services/platform.service';
import { platformAuthService } from '../services/platformAuth.service';
import {
  listAccessRequestsQuerySchema,
  updateAccessRequestSchema,
} from '../validators/accessRequest.schemas';
import { optionalPeriodQuerySchema } from '../validators/analytics.schemas';
import { idParamSchema } from '../validators/common.schemas';
import {
  addMessagePacksSchema,
  createTenantSchema,
  listTenantsQuerySchema,
  platformLoginSchema,
  platformRefreshSchema,
  tenantUserParamsSchema,
  updateTenantSchema,
} from '../validators/platform.schemas';
import { createTeamUserSchema, updateTeamUserSchema } from '../validators/user.schemas';
import { planService } from '../services/plan.service';
import {
  ANNUAL_MONTHS_PAID,
  FREE_ALLOWANCE,
  MESSAGE_PACK_SIZE,
  MODULE_DISCOUNTS,
  MODULE_PRICES,
  PAID_ALLOWANCES,
} from '../domain/plans';

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

  async overview(req: Request, res: Response) {
    const period = optionalPeriodQuerySchema(todayInTimezone(env.APP_TIMEZONE)).parse(req.query);
    res.json(await platformService.overview(period));
  },

  async listTenants(req: Request, res: Response) {
    const query = listTenantsQuerySchema.parse(req.query);
    res.json(await platformService.listTenants(query));
  },

  async getTenant(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await platformService.getTenant(id));
  },

  async tenantUsage(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await platformService.getTenant(id);
    res.json(await planService.usageOf(id));
  },

  async addMessagePacks(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { packs } = addMessagePacksSchema.parse(req.body ?? {});
    await platformService.getTenant(id);
    res.status(201).json(await planService.addMessagePacks(id, packs));
  },

  pricing(_req: Request, res: Response) {
    res.json({
      modules: MODULE_PRICES,
      discounts: MODULE_DISCOUNTS,
      annualMonthsPaid: ANNUAL_MONTHS_PAID,
      free: FREE_ALLOWANCE,
      paid: PAID_ALLOWANCES,
      packSize: MESSAGE_PACK_SIZE,
    });
  },

  async updateTenant(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateTenantSchema.parse(req.body);
    res.json(await platformService.updateTenant(id, input));
  },

  async createTenant(req: Request, res: Response) {
    const input = createTenantSchema.parse(req.body);
    res.status(201).json(await platformService.createTenant(input));
  },

  async createTenantUser(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = createTeamUserSchema.parse(req.body);
    res.status(201).json(await platformService.createTenantUser(id, input));
  },

  async updateTenantUser(req: Request, res: Response) {
    const { id, userId } = tenantUserParamsSchema.parse(req.params);
    const input = updateTeamUserSchema.parse(req.body);
    res.json(await platformService.updateTenantUser(id, userId, input));
  },

  async resetTenantUserPassword(req: Request, res: Response) {
    const { id, userId } = tenantUserParamsSchema.parse(req.params);
    res.json(await platformService.resetTenantUserPassword(id, userId));
  },

  async listAccessRequests(req: Request, res: Response) {
    const query = listAccessRequestsQuerySchema.parse(req.query);
    res.json(await accessRequestService.list(query));
  },

  async updateAccessRequest(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateAccessRequestSchema.parse(req.body);
    res.json(await accessRequestService.updateStatus(id, input));
  },
};
