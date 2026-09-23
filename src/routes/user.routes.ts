import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { requireRole } from '../middleware/authenticate';

/** Team management of the current business. Admin only. */
export const usersRouter = Router();
usersRouter.use(requireRole('admin'));

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List the team of the business, admins first (admin only)
 *     responses:
 *       200:
 *         description: Users
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/TenantUser' } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   post:
 *     tags: [Users]
 *     summary: Add a team member with a temporary password (admin only)
 *     description: The temporary password is returned only in this response; the user must change it at first sign-in.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TeamUserInput' }
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TenantUserWithPassword' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: EMAIL_TAKEN }
 */
usersRouter.get('/', userController.list);
usersRouter.post('/', userController.create);

/**
 * @openapi
 * /users/{id}:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   patch:
 *     tags: [Users]
 *     summary: Rename a team member, change their role or activate / deactivate them (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TeamUserUpdate' }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TenantUser' }
 *       400: { description: VALIDATION_ERROR, CANNOT_MODIFY_SELF or LAST_ADMIN }
 *       404: { description: USER_NOT_FOUND }
 * /users/{id}/reset-password:
 *   parameters:
 *     - { $ref: '#/components/parameters/Id' }
 *   post:
 *     tags: [Users]
 *     summary: Give a team member a new temporary password (admin only, not for yourself)
 *     responses:
 *       200:
 *         description: New temporary password (shown once)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TemporaryPassword' }
 *       400: { description: CANNOT_MODIFY_SELF }
 *       404: { description: USER_NOT_FOUND }
 */
usersRouter.patch('/:id', userController.update);
usersRouter.post('/:id/reset-password', userController.resetPassword);
