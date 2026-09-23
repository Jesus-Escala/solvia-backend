import { z } from 'zod';
import { emailSchema } from './auth.schemas';

const nameSchema = z.string().trim().min(2).max(120);
export const userRoleSchema = z.enum(['admin', 'collector']);

/** New team member; the password is generated (temporary) and returned once. */
export const createTeamUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: userRoleSchema,
});

export const updateTeamUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: userRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.role !== undefined || value.active !== undefined,
    { message: 'At least one of name, role or active is required' },
  );

export type CreateTeamUserInput = z.infer<typeof createTeamUserSchema>;
export type UpdateTeamUserInput = z.infer<typeof updateTeamUserSchema>;
