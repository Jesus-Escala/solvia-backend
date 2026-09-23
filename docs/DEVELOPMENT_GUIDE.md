# Development guide: how to code in Solvia

A practical guide to changing any part of the system. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the concepts; this file is about _doing_.

**Path convention:** paths without a prefix are relative to the root of `solvia-backend` (this repository). Frontend paths start with the repository name: `solvia-app/…`, `solvia-admin/…` or `solvia-landing/…`.

- [1. Daily workflow](#1-daily-workflow)
- [2. Conventions](#2-conventions)
- [3. Where do I change X?](#3-where-do-i-change-x)
- [4. Backend recipes](#4-backend-recipes)
  - [Create a migration](#create-a-migration)
  - [Add a field to an existing model](#add-a-field-to-an-existing-model)
  - [Add a new endpoint](#add-a-new-endpoint)
  - [Add a platform (backoffice) endpoint](#add-a-platform-backoffice-endpoint)
  - [Add a new API error code](#add-a-new-api-error-code)
  - [Add a new tenant-owned model](#add-a-new-tenant-owned-model)
  - [Add a real WhatsApp or payment provider](#add-a-real-whatsapp-or-payment-provider)
  - [Add a scheduled job](#add-a-scheduled-job)
  - [Add a message placeholder or template type](#add-a-message-placeholder-or-template-type)
  - [Change the risk score, reminder rules or password policy](#change-the-risk-score-reminder-rules-or-password-policy)
  - [Add an environment variable](#add-an-environment-variable)
- [5. Frontend recipes](#5-frontend-recipes)
  - [Call a new endpoint](#call-a-new-endpoint)
  - [Add a page](#add-a-page)
  - [Add a form (modal)](#add-a-form-modal)
  - [Add or change translations](#add-or-change-translations)
  - [Change the UI kit (`src/ui`)](#change-the-ui-kit-srcui)
  - [Add a new frontend project](#add-a-new-frontend-project)
  - [Regenerate the PWA icons](#regenerate-the-pwa-icons)
  - [Test the PWA locally](#test-the-pwa-locally)
  - [Styling, theming and motion](#styling-theming-and-motion)
- [6. Testing](#6-testing)
- [7. Before you commit (and CI)](#7-before-you-commit-and-ci)

---

## 1. Daily workflow

Clone the four repositories side by side (`solvia-backend`, `solvia-app`, `solvia-admin`, `solvia-landing`) in one folder.

```bash
# Terminal 1: database only (from solvia-backend)
docker compose up -d postgres

# Terminal 2: API with auto-reload
cd solvia-backend && npm run dev     # http://localhost:4000, docs at /api/docs

# Terminal 3: web app with HMR
cd solvia-app && npm run dev         # http://localhost:5173

# Optional (each in its own terminal)
cd solvia-admin && npm run dev       # backoffice   http://localhost:5175
cd solvia-landing && npm run dev     # landing page http://localhost:5174
```

First time only:

- `solvia-backend`: `cp .env.example .env`, `npm install`, `npx prisma migrate deploy && npm run db:seed`. `.env.example` documents every variable, including `SELF_SIGNUP_ENABLED`, `SEED_ON_START`, `PLATFORM_ADMIN_*` and `GOOGLE_CLIENT_ID`.
- **Each** frontend repository: `npm install` and `cp .env.example .env`. The frontends are independent: there is no workspace and no shared `node_modules`.

Useful during development:

| Need                              | Command / place                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Try endpoints                     | Swagger UI at http://localhost:4000/api/docs → **Authorize** with an access token from `POST /auth/login` (or `POST /admin/auth/login` for the backoffice routes)                |
| Browse the database               | `npx prisma studio` (in `solvia-backend`)                                                                                                                                        |
| See WhatsApp messages             | The API terminal: `MockWhatsAppProvider` prints every message                                                                                                                    |
| Run reminders now                 | Settings page → **Run reminders now**, or `POST /api/reminders/run`                                                                                                              |
| Reset demo data                   | `npm run db:seed -- --force` (tenants **and** access requests)                                                                                                                   |
| Jobs firing while you code        | Set `JOBS_ENABLED=false` in `.env`                                                                                                                                               |
| Try Google sign-in                | Set `GOOGLE_CLIENT_ID` in `.env` (with `http://localhost:5173` as an authorized JavaScript origin) and restart the API. With self sign-up off, only existing users can use it    |
| Try self-service sign-up          | Set `SELF_SIGNUP_ENABLED=true` in `.env` and restart the API: the web app shows the "Crear cuenta" tab again                                                                     |
| Try managed onboarding            | Landing → "Solicitar acceso" (or open http://localhost:5174/#solicitar-acceso), then backoffice → Solicitudes → convert, then sign in to the web app with the temporary password |
| Hit the access-request rate limit | 5 requests per hour per IP; restart the API to reset the in-memory counter                                                                                                       |
| Run the whole platform in Docker  | `docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build` from `solvia-backend` (set `SOLVIA_REPOS_DIR` if the frontends are not in `..`)                  |
| Replay the guided tour            | Help page → start the tour, or remove `solvia.tour.seen.<userId>` from localStorage                                                                                              |
| Force a language or theme         | The preferences control in the user menu (stored in `solvia.locale` / `solvia.theme`)                                                                                            |

---

## 2. Conventions

**Language:** code, identifiers, database fields, comments, commits, docs and API error messages are in **English**. The user interface is translated (Spanish default, English); **never hard-code UI text** in components, use `t('...')`.

**Style:** Prettier (single quotes, semicolons, trailing commas, 100 columns) and ESLint (flat config). Every repository has its own copy of the config; the three frontend configs are currently identical, so keep them that way. Run `npm run format && npm run lint` in every repository you touched before committing (CI runs `lint` and `format:check`).

**Naming**

| Thing                                                 | Convention                                                    | Example                                        |
| ----------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Backend files                                         | `<resource>.<layer>.ts`                                       | `customer.service.ts`, `receivable.routes.ts`  |
| Layer objects                                         | `<resource><Layer>` object literal                            | `customerService`, `receivableRepository`      |
| zod schemas                                           | `<verb><Resource>Schema` + inferred type                      | `createCustomerSchema`, `CreateCustomerInput`  |
| DTO mappers                                           | `to<Resource>Dto` in `services/dto.ts`                        | `toReceivableDto`                              |
| Error codes                                           | `UPPER_SNAKE_CASE`, stable once released                      | `PAYMENT_EXCEEDS_BALANCE`                      |
| React components/pages                                | PascalCase file = component                                   | `CustomerDetailPage.tsx`                       |
| React Query hooks                                     | `use<Resource>` / `use<Action><Resource>`                     | `useCustomers`, `useSaveCustomer`              |
| Repositories (= `package.json` name of the frontends) | `solvia-<name>`                                               | `solvia-app`, `solvia-admin`, `solvia-landing` |
| Translation keys                                      | nested camelCase, grouped by screen                           | `customers.form.phoneHint`                     |
| localStorage keys                                     | `solvia.<area>` (`solvia.admin.*` for the backoffice session) | `solvia.theme`                                 |
| DB tables                                             | snake_case plural via `@@map`                                 | `message_templates`                            |

**Rules of thumb**

- **Controllers** stay thin: parse the input, make one service call, send the response.
- **Services** throw `AppError` with a stable code for expected failures. Never send HTTP from a service.
- **Repositories** return Prisma objects; services convert them with `to*Dto` before returning.
- **Business rules** that can be pure go in `domain/` and get unit tests.
- **Money:** `toNumber()` from Prisma, `roundMoney()` after arithmetic; in the UI use `fmt.money()` from `useI18n()`.
- **Dates:** `todayInTimezone(env.APP_TIMEZONE)` for "today" and `toDateOnly()` / `dateOnlySchema` for input. Never use `new Date()` as a business date.
- **Config:** read everything through `env` from `config/env.ts`.
- **Frontend imports:** kit code comes from `'@/ui'` only (never `@/ui/components/...`). A frontend project never imports from another one; they don't share any files.
- **Comments:** explain _why_, not _what_. Match the density of the surrounding code.

**Commits:** Conventional Commits: `feat(api): ...`, `fix(web): ...`, `feat(admin): ...`, `feat(landing): ...`, `feat(ui): ...` (a kit change, usually repeated in several projects), `refactor: ...`, `test: ...`, `docs: ...`, `build: ...`, `chore: ...`.

---

## 3. Where do I change X?

Paths without a prefix are in `solvia-backend`; the others start with the frontend repository name. Anything under `src/ui/` exists **once per frontend repository**, so see [Change the UI kit](#change-the-ui-kit-srcui) before editing it.

| I want to...                                                                                                  | Go to                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change a table or column                                                                                      | `prisma/schema.prisma`, then [create a migration](#create-a-migration)                                                                                                                                                                                                                                                       |
| Change input validation (limits, formats)                                                                     | `src/validators/*.schemas.ts`                                                                                                                                                                                                                                                                                                |
| Change the password policy                                                                                    | `src/validators/auth.schemas.ts` **and** `src/ui/components/passwordRules.ts` in `solvia-app` and `solvia-admin` (+ `passwordRules` strings in each one's `src/ui/i18n/messages.ts`)                                                                                                                                         |
| Change what an endpoint returns                                                                               | `src/services/dto.ts` (+ `solvia-<project>/src/lib/types.ts`)                                                                                                                                                                                                                                                                |
| Change a business flow (payments, statements, reminders)                                                      | `src/services/<flow>.service.ts`                                                                                                                                                                                                                                                                                             |
| Change a pure rule (status, risk, reminder timing, cash-flow buckets, aging, team rules, temporary passwords) | `src/domain/*.ts` + `tests/*`                                                                                                                                                                                                                                                                                                |
| Change the dashboard summary or period analytics                                                              | `src/services/dashboard.service.ts`, `src/repositories/analytics.repository.ts` (SQL, always filter by tenant), `src/domain/portfolio.ts`, `src/domain/analytics.ts`; UI in `solvia-app/src/pages/DashboardPage.tsx` and `solvia-app/src/components/charts/`                                                                 |
| Change sign-in, sign-up or change-password                                                                    | `src/services/auth.service.ts`, `src/routes/auth.routes.ts`; UI in `solvia-app/src/pages/AuthPages.tsx`, `solvia-app/src/auth/`                                                                                                                                                                                              |
| Turn self-service sign-up on or off                                                                           | `SELF_SIGNUP_ENABLED` (backend env); the web app follows `GET /auth/config`                                                                                                                                                                                                                                                  |
| Change Google sign-in                                                                                         | `src/services/google.service.ts`, `src/domain/googleSignIn.ts`, `authService.googleSignIn`; UI in `solvia-app/src/components/auth/GoogleSignInButton.tsx` and `solvia-app/src/pages/AuthPages.tsx`                                                                                                                           |
| Change the forced password change                                                                             | `src/middleware/authenticate.ts` (`pwc` → `PASSWORD_CHANGE_REQUIRED`), `issueTokens()` in `src/services/token.service.ts`; UI `solvia-app/src/auth/RequireAuth.tsx`                                                                                                                                                          |
| Change temporary passwords                                                                                    | `src/domain/temporaryPassword.ts` (+ `tests/temporaryPassword.test.ts`); the dialog is `src/ui/components/TemporaryPasswordDialog.tsx` in app and admin                                                                                                                                                                      |
| Change team management rules                                                                                  | `src/domain/userManagement.ts`, `src/services/userManagement.service.ts`, `src/routes/user.routes.ts`; UI `src/ui/components/TeamUsers.tsx` (app and admin), `solvia-app/src/pages/UsersTab.tsx`, `solvia-admin/src/pages/TenantDetailPage.tsx`                                                                              |
| Change access requests (form, rate limit, honeypot, inbox)                                                    | `src/routes/public.routes.ts`, `src/controllers/public.controller.ts`, `src/services/accessRequest.service.ts`, `src/validators/accessRequest.schemas.ts`, `src/middleware/rateLimit.ts`; UI `solvia-landing/src/access/`, `solvia-admin/src/pages/AccessRequestsPage.tsx`, `solvia-admin/src/components/NewTenantModal.tsx` |
| Change backoffice metrics or tenant management                                                                | `src/services/platform.service.ts`, `src/repositories/platform.repository.ts`, `src/domain/platform.ts`; UI in `solvia-admin/src/pages/`                                                                                                                                                                                     |
| Change token handling                                                                                         | `src/services/token.service.ts`, `src/middleware/authenticate.ts`; frontend `src/ui/lib/http.ts` (each project) and each app's `auth/` + `lib/api.ts`                                                                                                                                                                        |
| Change default message texts or placeholders                                                                  | `src/domain/template.ts`                                                                                                                                                                                                                                                                                                     |
| Change the statement PDF layout                                                                               | `src/services/statement.service.ts`                                                                                                                                                                                                                                                                                          |
| Change job schedules                                                                                          | `REMINDER_CRON` / `MONTHLY_REPORT_CRON` env vars; code in `src/jobs/`                                                                                                                                                                                                                                                        |
| Change who can do what                                                                                        | `requireRole(...)` in `src/routes/*.routes.ts` + `isAdmin` checks in the UI                                                                                                                                                                                                                                                  |
| Change error response format                                                                                  | `src/middleware/errorHandler.ts`                                                                                                                                                                                                                                                                                             |
| Change how an error is shown to users                                                                         | `errors.codes` / `errors.fields` in `src/ui/i18n/messages.ts` of **every** project that can receive the code                                                                                                                                                                                                                 |
| Change API docs                                                                                               | `@openapi` blocks in route files; shared schemas in `src/config/swagger.ts`                                                                                                                                                                                                                                                  |
| Change demo data, demo access requests or the platform admin                                                  | `src/database/seed.ts`                                                                                                                                                                                                                                                                                                       |
| Change navigation                                                                                             | `solvia-app/src/components/layout/navItems.tsx` (sidebar and bottom bar), `Sidebar.tsx`, `Topbar.tsx` (user menu), `BottomNav.tsx`; backoffice `solvia-admin/src/components/AdminShell.tsx`                                                                                                                                  |
| Change routes/pages                                                                                           | `solvia-<project>/src/App.tsx`, `solvia-<project>/src/pages/`                                                                                                                                                                                                                                                                |
| Change API calls or caching                                                                                   | `solvia-app/src/hooks/queries.ts`, `solvia-admin/src/hooks/queries.ts`                                                                                                                                                                                                                                                       |
| Change the guided tour                                                                                        | `solvia-app/src/tour/steps.ts` (steps target `data-tour` elements) and `TourProvider.tsx`                                                                                                                                                                                                                                    |
| Change the Soli assistant menu or help center                                                                 | `solvia-app/src/components/layout/AssistantMenu.tsx`, `solvia-app/src/pages/HelpPage.tsx`                                                                                                                                                                                                                                    |
| Change the landing content or pricing                                                                         | `solvia-landing/src/sections/*` (plans in `sections/plans.ts`), texts in `solvia-landing/src/i18n/messages/`                                                                                                                                                                                                                 |
| Change links between the frontends                                                                            | `solvia-app/src/lib/config.ts` (`VITE_LANDING_URL`), `solvia-admin/src/lib/config.ts` and `solvia-landing/src/lib/config.ts` (`VITE_APP_URL`)                                                                                                                                                                                |
| Change UI text                                                                                                | `solvia-<project>/src/i18n/messages/es.ts` + `en.ts`; kit strings in that project's `src/ui/i18n/messages.ts`                                                                                                                                                                                                                |
| Change colors, tokens, dark mode, animations                                                                  | `src/ui/styles.css` (in each project)                                                                                                                                                                                                                                                                                        |
| Change a kit component, the logo or Soli                                                                      | `src/ui/components/`, `src/ui/brand/` (in each project that has it) + `public/favicon.svg` for the logo                                                                                                                                                                                                                      |
| Change number/date formatting                                                                                 | `createFormatters()` in `src/ui/i18n/I18nProvider.tsx` (each project)                                                                                                                                                                                                                                                        |
| Change the PWA manifest or caching                                                                            | `solvia-app/vite.config.ts`, `solvia-admin/vite.config.ts`                                                                                                                                                                                                                                                                   |
| Change Docker or proxy setup                                                                                  | `docker-compose.yml`, `Dockerfile`, `solvia-<project>/Dockerfile` and `nginx.conf.template`                                                                                                                                                                                                                                  |

---

## 4. Backend recipes

### Create a migration

**Interactive terminal (normal case):**

```bash
npx prisma migrate dev --name add_customer_email   # writes prisma/migrations/<timestamp>_add_customer_email/, applies it, regenerates the client
```

**Non-interactive shells** (CI, scripts, AI agents), where `migrate dev` refuses to run or waits for a prompt: generate the SQL with `migrate diff` and apply it with `migrate deploy`.

```bash
npx prisma migrate deploy                                   # 1. the dev DB must have every existing migration
mkdir -p prisma/migrations/20261001120000_add_customer_email # 2. <UTC timestamp>_<name>, newer than the last folder
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script --output prisma/migrations/20261001120000_add_customer_email/migration.sql
npx prisma migrate deploy                                   # 3. apply it
npx prisma generate                                         # 4. regenerate the client
```

`--from-schema-datasource` diffs against the database in `DATABASE_URL`, so step 1 matters: if the database is behind, the diff also contains older changes. Review the SQL before applying it. The two most recent migrations (`20260923190000_add_google_sign_in`, `20260924100000_add_platform_admin`) were created this way.

Commit the generated folder. Never edit a migration that has already been applied anywhere; create a new one instead.

### Add a field to an existing model

Example: add an optional `email` to `Customer`.

1. **Schema:** `prisma/schema.prisma`

   ```prisma
   model Customer {
     // ...
     email String?
   }
   ```

2. **Migration:** see [Create a migration](#create-a-migration) (`add_customer_email`).

3. **Validation:** `validators/customer.schemas.ts`

   ```ts
   export const createCustomerSchema = z.object({
     // ...
     email: z.email().nullish(),
   });
   ```

   `updateCustomerSchema` is derived with `.partial()`, so it picks the field up automatically.

4. **Repository write type:** add `email?: string | null` to `CustomerWriteData` in `repositories/customer.repository.ts`.

5. **DTO:** add `email: customer.email` in `toCustomerDto` (`services/dto.ts`).

6. **API docs:** add the property to `CustomerInput` and `Customer` in `config/swagger.ts`.

7. **Frontend** (`solvia-app/src/`):
   - add `email: string | null` to `Customer` in `lib/types.ts`
   - add it to `CustomerInput` in `hooks/queries.ts`
   - add a `Field` to `components/domain/CustomerFormModal.tsx`, following the existing blocks (`error={errors.field(save.error, 'email')}`)
   - add the label to `customers.form` in `i18n/messages/es.ts` **and** `en.ts`

8. **Seed (optional):** add sample values in `database/seed.ts`.

### Add a new endpoint

Example: `GET /api/customers/:id/notifications`, the WhatsApp log for one customer. (The log can already be filtered with `GET /api/notifications?customerId=...`; this is just a worked example.)

1. **Repository:** `repositories/notification.repository.ts`

   ```ts
   findByCustomer(customerId: string, take = 50) {
     return prisma.notification.findMany({
       // The tenant filter on `receivable` is added automatically by the scoped client.
       where: { receivable: { customerId } },
       orderBy: { sentAt: 'desc' },
       take,
     });
   },
   ```

2. **Service:** `services/customer.service.ts` (or `notification.service.ts`)

   ```ts
   async listNotifications(id: string) {
     await this.ensureExists(id); // 404 if the customer is not in this tenant
     const notifications = await notificationRepository.findByCustomer(id);
     return notifications.map(toNotificationDto);
   },
   ```

3. **Controller:** `controllers/customer.controller.ts`

   ```ts
   async notifications(req: Request, res: Response) {
     const { id } = idParamSchema.parse(req.params);
     res.json({ data: await customerService.listNotifications(id) });
   },
   ```

4. **Route + docs:** `routes/customer.routes.ts`

   ```ts
   /**
    * @openapi
    * /customers/{id}/notifications:
    *   get:
    *     tags: [Customers]
    *     summary: WhatsApp messages sent to a customer
    *     parameters:
    *       - { $ref: '#/components/parameters/Id' }
    *     responses:
    *       200: { description: Notifications }
    *       404: { $ref: '#/components/responses/NotFound' }
    */
   customerRouter.get('/:id/notifications', customerController.notifications);
   ```

   Routes mounted in `routes/index.ts` under `protectedRouter` are automatically authenticated (tenant tokens only) and tenant-scoped. Add `requireRole('admin')` if needed.

5. **Frontend hook:** see [Call a new endpoint](#call-a-new-endpoint).

**Checklist for any endpoint**

- [ ] Input parsed with a zod schema (params, query and body)
- [ ] Existence and ownership checked in the service (`findOrFail` / `ensureExists`)
- [ ] Response mapped through a DTO (no raw `Decimal` values)
- [ ] `@openapi` block added
- [ ] Role restriction decided
- [ ] Error cases use `AppError` with a stable code, translated in the frontend ([Add a new API error code](#add-a-new-api-error-code))
- [ ] Lists: pagination via `paginationSchema` + `paginate()`; sorting via a `sortBy` enum + `sortDirSchema`

### Add a platform (backoffice) endpoint

Example: `GET /api/admin/tenants/:id/receivables`.

1. **Repository:** add the query to `repositories/platform.repository.ts`. It uses `basePrisma` on purpose (cross-tenant), so **always filter by the tenant id explicitly**.
2. **Pure shaping** (sums, series, sorting) goes in `domain/platform.ts` with a test in `tests/platform.test.ts`.
3. **Service + controller:** `services/platform.service.ts`, `controllers/platform.controller.ts`; input schemas in `validators/platform.schemas.ts`.
4. **Route:** in `routes/platform.routes.ts`, **after** `platformRouter.use(authenticatePlatformAdmin)` and **before** the final `platformRouter.use(notFoundHandler)`. Tag the `@openapi` block `[Platform admin]`.
5. **Frontend:** add types to `solvia-admin/src/lib/types.ts` and a hook to `solvia-admin/src/hooks/queries.ts` (it uses the admin `api`, which carries the platform token).

Never mount platform routes under `protectedRouter`, and never accept tenant tokens in them: `authenticatePlatformAdmin` rejects them already.

### Add a new API error code

Error codes are an API contract: the frontends translate them.

1. **Backend:** throw it from the service (or middleware) with a status and an English message:

   ```ts
   throw new AppError(422, 'CUSTOMER_HAS_OPEN_DEBT', 'The customer still has unpaid receivables');
   ```

2. **Translations:** add the code to `errors.codes` in `src/ui/i18n/messages.ts` of **every frontend that can receive it**: `solvia-app` for tenant routes, `solvia-admin` for `/admin/*` and `solvia-landing` for `/public/*`. When in doubt, add it to all three. Add it in **both** `uiEs` and `uiEn`; the `UiMessages` type makes `uiEn` fail to compile if it is missing:

   ```ts
   CUSTOMER_HAS_OPEN_DEBT: 'El cliente todavía tiene deudas pendientes.',
   ```

3. **UI:** nothing else. `useErrorText().message(error)` looks up `errors.codes.<CODE>` automatically. If a specific form field should show a translated hint for validation errors, add it to `errors.fields.<fieldName>`.
4. **Docs:** add it to the codes table in [ARCHITECTURE.md §13](ARCHITECTURE.md#13-errors-and-validation).

Unknown codes fall back to the server's English message, so a missing translation degrades gracefully, but it is a bug.

### Add a new tenant-owned model

Example: `Expense` owned by a tenant.

1. **Schema:** include `tenantId`, the relation and an index:

   ```prisma
   model Expense {
     id        String   @id @default(uuid())
     tenantId  String
     amount    Decimal  @db.Decimal(12, 2)
     date      DateTime @db.Date
     createdAt DateTime @default(now())

     tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

     @@index([tenantId])
     @@map("expenses")
   }
   ```

   Also add `expenses Expense[]` to `Tenant`.

2. **⚠️ Register the model in the scoping extension.** This is the step that matters most. In `lib/prisma.ts`, add `'Expense'` to `DIRECT_TENANT_MODELS`. If it were scoped through a receivable, like `Payment`, it would go in `RECEIVABLE_SCOPED_MODELS` instead. **A model missing from these sets is NOT tenant-scoped.**

3. **Migration:** [create a migration](#create-a-migration) named `add_expenses`.

4. **Repository:** use `prisma` (scoped). Creates pass `tenantId: requireTenantId()`:

   ```ts
   create(data: { amount: number; date: Date }) {
     return prisma.expense.create({ data: { ...data, tenantId: requireTenantId() } });
   },
   ```

5. Continue with the service, controller, routes, DTO and frontend, as in [Add a new endpoint](#add-a-new-endpoint). If the backoffice should show it, add a cross-tenant count to `platform.repository.ts`.

6. **Test isolation manually:** log in as two tenants and confirm tenant B gets `404` for tenant A's ids.

### Add a real WhatsApp or payment provider

Example: Meta WhatsApp Cloud API.

1. **Config:**
   - Add the variables to the zod schema in `config/env.ts`, optional because they are only needed when this provider is selected:
     ```ts
     WHATSAPP_META_ACCESS_TOKEN: z.string().optional(),
     WHATSAPP_META_PHONE_NUMBER_ID: z.string().optional(),
     WHATSAPP_META_API_VERSION: z.string().default('v21.0'),
     ```
   - Keep `.env.example` in sync; the placeholders already exist there.

2. **Implement the interface:** `providers/whatsapp/MetaWhatsAppProvider.ts`

   ```ts
   import { renderTemplate, type TemplateVariables } from '../../domain/template';
   import type { WhatsAppProvider, WhatsAppSendResult, WhatsAppTemplate } from './WhatsAppProvider';

   export class MetaWhatsAppProvider implements WhatsAppProvider {
     readonly name = 'meta';

     constructor(
       private readonly accessToken: string,
       private readonly phoneNumberId: string,
       private readonly apiVersion: string,
     ) {}

     async send(
       to: string,
       template: WhatsAppTemplate,
       variables: TemplateVariables,
     ): Promise<WhatsAppSendResult> {
       const content = renderTemplate(template.text, variables);
       try {
         const response = await fetch(
           `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
           {
             method: 'POST',
             headers: {
               Authorization: `Bearer ${this.accessToken}`,
               'Content-Type': 'application/json',
             },
             body: JSON.stringify({
               messaging_product: 'whatsapp',
               to: to.replace('+', ''),
               type: 'text',
               text: { body: content },
             }),
           },
         );
         const body = (await response.json()) as {
           messages?: Array<{ id: string }>;
           error?: { message: string };
         };
         if (!response.ok)
           return { success: false, content, error: body.error?.message ?? response.statusText };
         return { success: true, content, providerMessageId: body.messages?.[0]?.id };
       } catch (error) {
         // Never throw for delivery problems: return a failed result so the attempt is logged.
         return {
           success: false,
           content,
           error: error instanceof Error ? error.message : String(error),
         };
       }
     }
   }
   ```

   > Business-initiated WhatsApp messages outside the 24-hour customer-service window must use **pre-approved Meta templates** (`type: 'template'` with parameters), not free text. A production adapter should map each `MessageTemplateType` to an approved template name and pass `variables` as its parameters. The interface already provides the `template.type` and `variables` it needs.

3. **Register it** in `providers/whatsapp/index.ts`:

   ```ts
   case 'meta':
     if (!env.WHATSAPP_META_ACCESS_TOKEN || !env.WHATSAPP_META_PHONE_NUMBER_ID) {
       throw new Error('WHATSAPP_META_ACCESS_TOKEN and WHATSAPP_META_PHONE_NUMBER_ID are required');
     }
     return new MetaWhatsAppProvider(
       env.WHATSAPP_META_ACCESS_TOKEN,
       env.WHATSAPP_META_PHONE_NUMBER_ID,
       env.WHATSAPP_META_API_VERSION,
     );
   ```

4. **Select it:** set `WHATSAPP_PROVIDER=meta`. No other code changes are needed: reminders, statements and the notification log all use the interface.

**Payment provider (Culqi / Mercado Pago):** same pattern with `PaymentProvider.createPaymentLink()` in `providers/payment/`. Use `request.reference` (the receivable id) as the gateway's external reference. To mark payments automatically you will also need:

- a **public webhook route** outside `protectedRouter` in `routes/index.ts`, with signature verification
- inside it, look up the receivable with `basePrisma` to find its tenant (and ignore suspended tenants), then call `runWithTenant(tenantId, () => paymentService.register(...))`
- idempotency: store the gateway payment id so a webhook that is delivered twice doesn't register the payment twice

### Add a scheduled job

1. Write the job in `jobs/<name>.job.ts`. Run tenant work through `runForEachTenant` so each **active** tenant gets its own context and errors stay isolated:

   ```ts
   export async function runCleanupJob() {
     return runForEachTenant('cleanup', () => someService.cleanupForCurrentTenant());
   }
   ```

2. Register it in `startScheduler()` in `jobs/scheduler.ts`:

   ```ts
   schedule('cleanup', env.CLEANUP_CRON, () => runCleanupJob());
   ```

   Add `CLEANUP_CRON` to `config/env.ts` with a default, and to `.env.example`.

3. **Make it idempotent.** Jobs may run twice after a restart, or late. Decide from persisted state (like the reminder engine's "last sent"), never from "the job ran at 10:00".

4. Optionally expose an admin endpoint to trigger it manually (see `POST /reminders/run`).

### Add a message placeholder or template type

**New placeholder** (e.g. `{{customerDocument}}`):

1. Add it to `TEMPLATE_PLACEHOLDERS` in `domain/template.ts`, which feeds the Settings UI chips.
2. Provide its value where messages are built:
   - `buildVariables()` in `services/reminder.service.ts` for reminders
   - `sendStatement()` in `services/statement.service.ts` for statements
3. Add a sample value to `PREVIEW_VALUES` in `solvia-app/src/pages/SettingsPage.tsx`.

**New template type** (e.g. `thank_you`):

1. Add the value to `enum MessageTemplateType` in the schema, then [create a migration](#create-a-migration).
2. Add a default text to `DEFAULT_TEMPLATES`. Existing tenants fall back to it automatically (`settingsService.listTemplates`), and the reset endpoint uses it.
3. Add it to `templateTypeSchema` (`validators/settings.schemas.ts`) and to the enum lists in the `@openapi` blocks.
4. Frontend: add it to `TemplateType` in `solvia-app/src/lib/types.ts` and add `templateTypes.<type>.title` / `.description` to both dictionaries of the web app.

### Change the risk score, reminder rules or password policy

1. Edit the pure function (`domain/riskScore.ts` → `RISK_THRESHOLDS`, or `domain/reminderRules.ts`).
2. Update or add cases in `tests/riskScore.test.ts` / `tests/reminderRules.test.ts` **first**, then make them pass.
3. Update the tables in `README.md` and [ARCHITECTURE.md](ARCHITECTURE.md#8-business-rules).
4. If you add a new configurable rule:
   - add a column to `ReminderSettings` and create a migration
   - add it to `ReminderRules` and `DEFAULT_REMINDER_RULES`, `reminderSettingsSchema`, and `toRules()` in `settings.service.ts`
   - add a control (and its translations) to the Settings page

**Password policy:** change `passwordSchema` in `validators/auth.schemas.ts` and `tests/passwordPolicy.test.ts`, then mirror it in `src/ui/components/passwordRules.ts` (`PASSWORD_RULES`) and the `passwordRules` strings in `src/ui/i18n/messages.ts`, in **both** `solvia-app` and `solvia-admin`. Generated temporary passwords (`domain/temporaryPassword.ts`) must keep satisfying it; `tests/temporaryPassword.test.ts` checks that. The seed validates `PLATFORM_ADMIN_PASSWORD` with the same schema, so a stricter policy can break a seeded password.

### Add an environment variable

1. Add it to the zod schema in `src/config/env.ts`, with a default or as optional/required.
2. Add it, documented, to `.env.example`.
3. Add it to `docker-compose.yml` if Docker needs a non-default value (it is the base file; `docker-compose.full.yml` only adds the frontends).
4. Document it in the README's environment table.

Frontend variables must start with `VITE_`. They are read via `import.meta.env` and baked in **at build time**. Add them to the `.env.example` and README of every frontend that reads them. In Docker, declare them as build `ARG`s (and `ENV`) in **that repository's** `Dockerfile`, and pass them from the service's `build.args` in `docker-compose.full.yml` when the local value differs from the default.

---

## 5. Frontend recipes

Each frontend is its own repository. Paths below start with the repository name.

### Call a new endpoint

1. Add the response type to `solvia-app/src/lib/types.ts`.
2. Add a hook to `solvia-app/src/hooks/queries.ts`:

   ```ts
   export function useCustomerNotifications(customerId: string) {
     return useQuery({
       queryKey: ['customers', 'notifications', customerId],
       queryFn: () => api.get<{ data: Notification[] }>(`/customers/${customerId}/notifications`),
     });
   }
   ```

   **Query key rule:** start keys with the resource prefix (`'customers'`, `'receivables'`...) so the existing invalidation (`useInvalidateCollections` in the same file) refreshes them after mutations.

3. For mutations, use `useMutation` and invalidate what changed:

   ```ts
   export function useArchiveCustomer() {
     const invalidate = useInvalidateCollections();
     return useMutation({
       mutationFn: (id: string) => api.post(`/customers/${id}/archive`),
       onSuccess: invalidate,
     });
   }
   ```

Every call goes through the app's `src/lib/api.ts`, which is built with `createApiClient` from `@/ui`. It already handles the token, the refresh on `401`, JSON/FormData bodies and `ApiError`. Use `api.public.*` for endpoints that don't need a session, like `/auth/config`. Never call `fetch` directly from components.

The backoffice works the same way with `solvia-admin/src/lib/api.ts`. The landing has a session-less client in `solvia-landing/src/lib/api.ts` and only uses `api.public.post`.

### Add a page

1. Create `solvia-app/src/pages/MyPage.tsx` using the kit:

   ```tsx
   import { Alert, Card, LoadingState, Page, PageHeader, useErrorText } from '@/ui';
   import { useI18n } from '../i18n/I18nProvider';

   export function MyPage() {
     const { t } = useI18n();
     const errors = useErrorText();
     const { data, isLoading, error } = useSomething();
     return (
       <Page>
         <PageHeader title={t('myPage.title')} description={t('myPage.description')} />
         {isLoading && <LoadingState label={t('common.loading')} />}
         {error && <Alert tone="danger">{errors.message(error)}</Alert>}
         {data && <Card title={t('myPage.section')}>{/* ... */}</Card>}
       </Page>
     );
   }
   ```

   Use `<Page fill>` for a list page whose `DataTable` should take the remaining height and scroll internally.

2. Add a route in `solvia-app/src/App.tsx`:
   - inside the `<AppShell />` route for authenticated pages. They sit under `RequireAuth`, so users with a temporary password are redirected to `/change-password` automatically.
   - inside `<PublicOnly />` for public ones.
3. Add an entry to `NAV_ITEMS` in `solvia-app/src/components/layout/navItems.tsx` if it belongs in the main navigation (it feeds both the sidebar and the phone bottom bar). In the backoffice, the navigation is `NAV` in `solvia-admin/src/components/AdminShell.tsx`.
4. Add the `myPage.*` strings to `es.ts` and `en.ts` ([Add or change translations](#add-or-change-translations)).

### Add a form (modal)

Follow `solvia-app/src/components/domain/CustomerFormModal.tsx`:

- **Structure:** the outer component renders `<Modal>`, and the inner form mounts only while it is open, so its state always starts from current props:
  ```tsx
  <Modal open={open} title={t('...')} onClose={onClose} closeLabel={t('common.close')}>
    {open && <MyForm ... />}
  </Modal>
  ```
  `Modal` animates in and out and becomes a bottom sheet on phones; you don't need to do anything for that. Popovers and menus inside it (e.g. the `PhoneInput` country picker) render inside the `<dialog>`, so they work without extra code.
- **Fields:** `<Field label error hint optionalLabel>{(id, describedBy) => <input id={id} aria-describedby={describedBy} className="input" ... />}</Field>` for accessible labels.
- **Phones:** use `<PhoneInput>` (app and landing kits). The value is E.164 (`''` when empty); validate it with `isValidPhone()` and display stored numbers with `formatPhone()`.
- **Server errors:** `const errors = useErrorText();`
  - pass `errors.field(mutation.error, '<name>')` to each `Field`'s `error`
  - show `<Alert tone="danger">{errors.message(mutation.error)}</Alert>` only when `!errors.hasFieldErrors(mutation.error)`
- **Passwords:** use `PasswordInput` and `<PasswordChecklist>`, and don't submit until `meetsPasswordPolicy(value)` is true (see `ChangePasswordPage` in `pages/AuthPages.tsx`).
- **One-time secrets** (temporary passwords): show them with `TemporaryPasswordDialog`, never in a toast.
- **Submit:** `await mutation.mutateAsync(values); toast.success(t('...')); onClose();` (with `const { toast } = useFeedback()`), wrapped as `void submit(e).catch(() => undefined)`, because the error is already shown through `mutation.error`.
- **Confirmations:** `if (await confirm({ title, message, confirmLabel })) { ... }` from `useFeedback()`, never `window.confirm`.

### Add or change translations

Each frontend has `src/i18n/messages/es.ts` and `en.ts`. Kit strings live in that frontend's `src/ui/i18n/messages.ts` (`uiEs` / `uiEn`), which is spread into its dictionaries.

1. **`es.ts` is the source of truth.** Add the key there first, grouped by screen. Use `{name}` placeholders for interpolation: `t('common.updatedMinutesAgo', { minutes: 5 })`.
2. **Add the same key to `en.ts`.** It is typed `Messages` (derived from `es.ts`), so a missing or extra key is a compile error (`npm run typecheck`).
3. **Use it:** `const { t, fmt } = useI18n();` then `t('myPage.title')`. `t()` only accepts keys that exist (`TranslationKey`). For keys built at runtime (e.g. `` `templateTypes.${type}.title` ``), make sure every possible value exists.
4. **Kit strings** (used by kit components, error codes, password rules, PWA texts, the phone field, preferences): add them to both `uiEs` and `uiEn`. Components inside the kit read them with `useUiI18n()`. If the same kit component exists in other repositories, add the strings there too.
5. Format numbers and dates with `fmt.*` (`fmt.money`, `fmt.date`, `fmt.period`...), never with `toLocaleString`.

Adding a whole **new language** means doing this in every frontend: add it to `Locale` / `LOCALES` in `src/ui/i18n/locales.ts`, add a `ui<Lang>` block in `src/ui/i18n/messages.ts`, and pass a dictionary to the project's `I18nProvider`.

### Change the UI kit (`src/ui`)

There is **no shared package**. `solvia-app`, `solvia-admin` and `solvia-landing` each have their own `src/ui`, imported as `'@/ui'`. That is the price of independent repositories: each one builds and deploys alone, but **a kit change must be repeated in every repository that needs it**. [ARCHITECTURE.md §14.2](ARCHITECTURE.md#142-the-ui-kit-srcui-one-copy-per-project) has the table of which kit files exist where.

Checklist for a kit change:

1. **Decide the scope.** Is it a fix or a token that every frontend should get, or a feature only one needs? If it's local, change only that repository. Say so in the commit, and consider noting it in that repository's README if it makes the copy diverge.
2. **Make the change in the first repository** under `src/ui/` (`components/`, `brand/`, `charts/`, `hooks/`, `pwa/`, `i18n/`, `lib/` or `styles.css`):
   - Use design tokens (`bg-surface`, `text-ink`, `border-line`, `text-primary-ink`...) and `cx()` for class names.
   - **No app imports:** kit code must not import from outside `src/ui` (pages, `src/i18n`, `src/lib`). Take texts as props, or add strings to `uiEs`/`uiEn` and read them with `useUiI18n()`.
   - **Export it** from `src/ui/index.ts`. Apps import from `'@/ui'` only.
   - New CSS (keyframes, component classes) goes in `src/ui/styles.css`, and new animations must respect `prefers-reduced-motion` (add them to the reduced-motion block). Tailwind finds classes in `src/ui` automatically, because it is under `src/`.
3. **Copy it to the other repositories that have that file.** Typical sets:
   - Shared by all three: `brand/`, `theme/`, `lib/http.ts`, `styles.css`, `i18n/` (except `messages.ts`), and `components/` `Button`, `cx`, `Display`, `Feedback`, `Form`, `Modal`, `Overlays`, `PreferencesControls`, `Reveal`.
   - App + backoffice: `DataTable`, `KpiCard`, `Page`, `IndustrySelect`, `PasswordChecklist`, `passwordRules`, `TeamUsers`, `TemporaryPasswordDialog`, `charts/`, `hooks/`, `pwa/`.
   - App + landing: `PhoneInput`, `phoneCountries` (plus the `libphonenumber-js` and `country-flag-icons` dependencies in `package.json`).
   - `index.ts` and `i18n/messages.ts` differ per repository: merge by hand instead of copying the whole file.
4. **Dependencies:** if the change adds an npm package, `npm install <pkg>` in each repository that received it, and commit its `package-lock.json`.
5. **Brand:** if the logo changes, also update `public/favicon.svg` in every frontend, the PDF header in `solvia-backend` (`src/services/statement.service.ts`) and the PWA icons ([Regenerate the PWA icons](#regenerate-the-pwa-icons)).
6. **Check each repository:** `npm run typecheck && npm run lint && npm run build`. CI runs `lint`, `format:check` and `build` on every push.
7. **Compare the copies** from the folder that holds the clones: `diff -rq solvia-app/src/ui solvia-admin/src/ui`, and the same against `solvia-landing/src/ui`. Only the differences you expect should remain.

### Add a new frontend project

Example: `solvia-portal` (port 5176), a new repository.

1. **Scaffold** it by copying the closest frontend (`solvia-landing` for a public site, `solvia-admin` for an app with a session), without `node_modules`, `dist`, `dev-dist` or `.env`. Then adjust:
   - `package.json`: `"name": "solvia-portal"`, keep the scripts (`dev`, `build`, `preview`, `typecheck`, `lint`, `lint:fix`, `format`, `format:check`), and delete `package-lock.json` so a fresh one is generated.
   - `vite.config.ts`: `server.port: 5176`; the `@` alias (`resolve.alias`) and the `/api` proxy to `VITE_PROXY_TARGET` if it calls the API.
   - `tsconfig.app.json`: keep `paths: { "@/*": ["./src/*"] }`.
   - `index.html` with the theme pre-paint script (it reads `solvia.theme` and sets `data-theme`).
   - `src/ui`: keep only the kit files it needs, and trim `index.ts` and `i18n/messages.ts` to match.
   - `src/index.css`: `@import 'tailwindcss'; @import './ui/styles.css';`.
   - `src/main.tsx` wrapping the app in `ThemeProvider` and the project's `I18nProvider` (plus `QueryClientProvider` and `FeedbackProvider` if needed).
   - `src/i18n/messages/es.ts` (`...uiEs` first) and `en.ts` (`...uiEn`, typed `Messages`), plus `useI18n = createUseI18n<Messages>()`.
   - For a session: `createTokenStore('solvia.portal')` (a unique prefix) and `createApiClient({ tokens, refreshPath })`.
   - `.env.example` listing every `VITE_*` it reads, and the `ARG`/`ENV` lines in its `Dockerfile`.
   - `.github/workflows/ci.yml` (copy it) and a README.
2. **Install:** `npm install` in the new repository.
3. **Docker:** add a service to `docker-compose.full.yml` in `solvia-backend`, with `build.context: ${SOLVIA_REPOS_DIR:-..}/solvia-portal`, its build args, `API_UPSTREAM: http://backend:4000` and a free host port.
4. **Backend:** if it calls the API from a different origin (no proxy), add that origin to `CORS_ORIGINS`.
5. **PWA (optional):**
   - add `VitePWA(...)` to `vite.config.ts` like `solvia-app`, and a `PwaManager`
   - add `/// <reference types="vite-plugin-pwa/react" />` to `src/vite-env.d.ts`
   - add the `beforeinstallprompt` capture script to `index.html`
   - add `pwa-assets.config.ts` and the `icons` script, then generate the icons ([Regenerate the PWA icons](#regenerate-the-pwa-icons))
6. Document it in the `solvia-backend` README ([Repositories](../README.md#repositories)), [ARCHITECTURE.md §14](ARCHITECTURE.md#14-frontend-architecture) and [MAINTENANCE.md §10](MAINTENANCE.md#10-repositories).

### Regenerate the PWA icons

The icons in `solvia-app/public/` and `solvia-admin/public/` are generated from each one's `public/favicon.svg` by `@vite-pwa/assets-generator`. It is configured in `pwa-assets.config.ts`: the `minimal2023Preset`, with the brand teal behind the maskable and Apple icons.

```bash
# in solvia-app or solvia-admin
npm run icons     # rewrites pwa-64x64.png, pwa-192x192.png, pwa-512x512.png,
                  # maskable-icon-512x512.png, apple-touch-icon-180x180.png, favicon.ico
```

When the logo changes:

1. Update `favicon.svg` in **every** frontend, and `src/ui/brand/owlGeometry.ts`, which it mirrors.
2. Regenerate the icons in `solvia-app` and `solvia-admin`, and commit the PNG/ICO files.
3. If you rename or add icons, update the `manifest.icons` list in that app's `vite.config.ts` and the `<link>` tags in its `index.html`.

### Test the PWA locally

In `solvia-app` and `solvia-admin`, `devOptions.enabled` registers the service worker in `npm run dev` too, so the browser's native install prompt can be tested right away. The dev service worker is generated in `dev-dist/`, which is gitignored.

To test the **production** behavior (the precache and the update card), build and preview:

```bash
# in solvia-app or solvia-admin
npm run build && npm run preview
```

1. Open the preview URL that Vite prints (localhost counts as a secure context).
2. Check DevTools → Application → Manifest / Service workers.
3. To see the update card, rebuild with a change and reload: `PwaUpdatePrompt` appears.
4. To reset, unregister the service worker and clear site data.

`vite preview` reuses the dev-server proxy (`server.proxy`), so the API must be running on `VITE_PROXY_TARGET`. You can also test the real deployment in Docker (http://localhost:8080 and http://localhost:8082 with `docker-compose.full.yml`).

### Styling, theming and motion

- **Tokens:** TailwindCSS v4 with utility classes. Design tokens are CSS variables in each frontend's `src/ui/styles.css`, defined for `[data-theme='light']` and `[data-theme='dark']` and exposed to Tailwind through `@theme` (`bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-primary`, `text-primary-ink`, `bg-success-soft`, `text-danger-ink`, `chart-1..`...). Add new tokens with values for **both** themes, and in every frontend that should follow them.
- **Dark mode** follows `data-theme` (set by `ThemeProvider` and the pre-paint script), not the OS directly: the `dark:` variant is `[data-theme='dark']`. Never read `prefers-color-scheme` in components; use `useTheme().resolved`.
- Shared component classes (`.input`, `.label`) live in `styles.css` under `@layer components`.
- **Status and risk colors** are reserved for their meaning. Always pair them with a text label or icon (see `solvia-app/src/components/domain/Badges.tsx`), and never reuse them for decorative purposes.
- **Motion:** use the existing classes (`animate-page-in`, `animate-pop-in`, `animate-fade-in`, `stagger-in`, `<Reveal>`) instead of new ad-hoc animations, and keep `prefers-reduced-motion` working. Entrance animations on containers that host fixed-position popovers (like modals) must use `backwards` fill, not `both`. Otherwise a leftover transform makes the popovers position against the container instead of the viewport.
- **Charts** (Recharts, app and backoffice):
  - Wrap them in a container with a fixed height (`CHART_HEIGHT`) and `min-w-0` (a grid or flex child without `min-width: 0` can cause resize feedback loops).
  - Read colors with `useChartColors()` and use `ChartTooltipCard` / `AXIS_TICK` for a consistent look; prefer `DonutChart` and `RankingBars` when they fit.
  - Offer a table view for accessibility.
- **Responsive:** check phone width. The web app switches to `BottomNav`, modals become bottom sheets, and tables scroll internally.

---

## 6. Testing

### Unit tests (backend)

```bash
npm test            # single run (81 tests in 12 files, no database needed)
npm run test:watch  # watch mode
```

Tests live in `tests/` and target:

- the pure code in `src/domain/` and `src/lib/` (including temporary passwords, team rules and the rate limiter)
- the password and access-request schemas
- the token service

Build dates with `toDateOnly('2026-09-23')` and `addDays(today, n)` so tests are deterministic:

```ts
import { describe, expect, it } from 'vitest';
import { determineReminder, DEFAULT_REMINDER_RULES } from '../src/domain/reminderRules';
import { addDays, toDateOnly } from '../src/lib/dates';

const today = toDateOnly('2026-09-23');

it('sends the due-date reminder once', () => {
  const candidate = { totalAmount: 100, paidAmount: 0, dueDate: today, lastSent: {} };
  expect(determineReminder(candidate, DEFAULT_REMINDER_RULES, today)?.type).toBe('due_reminder');
});
```

Code that imports `config/env.ts` needs the required variables set **before** it is imported. `tests/platformTokens.test.ts` shows how: it sets `DATABASE_URL` and the JWT secrets, then uses a dynamic `import()`. CI passes dummy values for the same variables.

When logic sits in a service and is hard to test, extract the decision into a pure function in `domain/` and test that. `resolveGoogleSignIn`, `checkUserChange` and `domain/platform.ts` are examples.

The frontends have no automated tests. The safety net is `npm run typecheck` (which also checks that `en.ts` matches `es.ts`), `npm run build` in CI, and the smoke tests below.

### Manual API testing

1. Get a token:

   ```bash
   curl -s -X POST http://localhost:4000/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@bodegasanmartin.pe","password":"Password123!"}'
   ```

2. Use it: `curl -H "Authorization: Bearer <accessToken>" http://localhost:4000/api/customers`, or click **Authorize** in Swagger.
3. **Isolation check:** repeat a request for another tenant's id with a token from `admin@elconstructor.pe`. It must return `404`.
4. **Realm check:** get a platform token from `POST /api/admin/auth/login` (`admin@solvia.app` / `Password123!`). Calling `/api/customers` with it must return `401`, and calling `/api/admin/overview` with a tenant token must return `401`.
5. **Forced password change:**
   1. Create a user (`POST /api/users` as the admin) and log in with the returned `temporaryPassword`.
   2. `GET /api/customers` with that token must return `403 PASSWORD_CHANGE_REQUIRED`, while `GET /api/auth/me` works.
   3. After `POST /api/auth/change-password`, the new token works everywhere.
6. **Sign-up disabled:** `POST /api/auth/register` must return `403 SIGNUP_DISABLED` unless `SELF_SIGNUP_ENABLED=true`.
7. **Access requests:**
   - `POST /api/public/access-requests` returns `201 { ok: true }`, and the request appears in `GET /api/admin/access-requests`.
   - With `"website": "x"`, nothing is stored.
   - The sixth request from the same IP within an hour returns `429`.

### Manual UI smoke test

**Web app** (http://localhost:5173):

1. Log in as `admin@bodegasanmartin.pe`. The dashboard shows KPIs, the aging strip, the trend chart, top debtors, risk distribution and overdue alerts. The first login shows the guided-tour welcome.
2. With self sign-up off, the sign-in page has no "Crear cuenta" tab, and "Solicita acceso" opens the landing's form. `/register` redirects to `/login`.
3. **Customers:** the risk badges show; sort by outstanding and by risk; open a customer. Create one: the phone field defaults to Peru, the country picker opens inside the modal, and an invalid number is rejected.
4. **Register a partial payment** with a proof image:
   - the status becomes **Partial**
   - the payment shows in the history
   - the API console prints the statement message
5. **View statement (PDF)** opens the PDF.
6. **Receivables** page: filter **Overdue**, sort a column, reload the page (the URL keeps the state), then click **Remind**.
7. **Settings:** edit a template, save it, restore it, **Run reminders now**, then check the send log.
8. **Settings → Users:**
   1. Add a collector. The temporary password dialog shows once, with copy and WhatsApp.
   2. Try to deactivate yourself (blocked), then deactivate and reactivate the new user.
9. Log in as the new user with the temporary password. You land on `/change-password`, and any other URL redirects there. After changing it, the app opens normally.
10. Switch language (ES/EN) and theme (light/dark/system) from the user menu; check a phone-width viewport.
11. Log in as `collector@bodegasanmartin.pe`: delete buttons, settings editing and the Users tab are hidden.

**Landing page** (http://localhost:5174):

1. Open `/#solicitar-acceso-starter`: the form opens with the Starter plan selected. Closing it clears the hash.
2. Submit a request with a valid phone: the success message appears.

**Backoffice** (http://localhost:5175):

1. Log in as `admin@solvia.app`. The overview shows totals, charts and the pending-requests KPI.
2. **Solicitudes:** the request from the landing is there. Convert it: the form is prefilled (including the plan), and the temporary password is shown once. You then land on the new business.
3. **Businesses:** search by a user email (e.g. `elconstructor`), filter by plan and status, sort by outstanding. "Nueva empresa" works without a request too.
4. Open a business: its users are listed. Add a user, reset a password, and try to deactivate the last admin (blocked). Change its plan.
5. **Suspend** it, then try to log in to the web app as one of its users: the error says the business is suspended. Reactivate it.

---

## 7. Before you commit (and CI)

Run the same checks as CI in each repository you touched:

```bash
# solvia-backend
npm run format && npm run lint && npm run typecheck && npm test && npm run build
# solvia-app, solvia-admin, solvia-landing (each)
npm run format && npm run lint && npm run typecheck && npm run build
```

CI (`.github/workflows/ci.yml` in every repository, on pushes to `main` and on pull requests, Node 22):

- **backend:** `npm ci`, `npx prisma generate`, `lint`, `format:check`, `typecheck`, `npm test`, `build`
- **frontends:** `npm ci`, `lint`, `format:check`, `build`

Checklist:

- [ ] If the schema changed: a new migration folder is committed and `npx prisma generate` has been run.
- [ ] New env vars are in `config/env.ts`, `.env.example`, the Compose files (if needed) and the README. New `VITE_*` vars are in that frontend's `.env.example`, its `Dockerfile` build args and its README.
- [ ] New endpoints have zod validation, `@openapi` docs and a role decision.
- [ ] New error codes are translated in `src/ui/i18n/messages.ts` of every frontend that can receive them (both languages).
- [ ] New UI text is in `es.ts` **and** `en.ts`.
- [ ] Kit changes are repeated in every frontend that has the file ([checklist](#change-the-ui-kit-srcui)).
- [ ] New tenant-owned models are registered in `lib/prisma.ts`.
- [ ] Business rule or password policy changes have tests, the frontend mirrors (app **and** backoffice) and updated docs.
- [ ] No secrets, `.env` files, `storage/`, `dist/` or `dev-dist/` in the commit.
