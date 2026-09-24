# Solvia — API (`solvia-backend`)

This repository holds the Solvia API and is the entry point to the whole system. The documentation for every part of Solvia lives here, in [`docs/`](docs/README.md).

**Solvia** is a multi-tenant SaaS for credit management and collections, built for small and medium businesses. Each business on the platform is an independent tenant. It tracks what its customers owe, registers payments, sends automatic WhatsApp reminders with payment links, generates PDF account statements and projects its cash flow. Solvia staff manage every business from a separate platform backoffice, and onboard new businesses there (**managed onboarding**): visitors request access on the landing page, and the Solvia team creates the business with a first admin who gets a temporary password.

- **Backend:** Node.js, TypeScript, Express 5 (routes → controllers → services → repositories), Prisma 6, PostgreSQL
- **Frontend:** three **independent** React 19 repositories, each with its own copy of the Solvia UI kit (see [Repositories](#repositories)). They use TypeScript, Vite 7, TailwindCSS 4, React Router 7, React Query 5 and Recharts 3. The web app and the backoffice are installable as PWAs (`vite-plugin-pwa`).
- **Auth:** JWT access and refresh tokens, bcrypt password hashing, temporary passwords with a forced change at first sign-in, optional "Sign in with Google", and separate platform-admin tokens for the backoffice
- **Jobs:** node-cron (hourly reminder engine, month-end report)
- **i18n and theming:** Spanish (default) and English; light, dark or system theme
- **Docs:** OpenAPI/Swagger generated from route annotations
- **Tooling:** ESLint and Prettier (per project), Vitest unit tests, Docker Compose

> 📚 **In-depth documentation** lives in [`docs/`](docs/README.md): [architecture](docs/ARCHITECTURE.md), [development guide](docs/DEVELOPMENT_GUIDE.md) and [maintenance](docs/MAINTENANCE.md). Each frontend repository also has its own README covering its setup, environment variables and Docker image.

---

## Contents

- [Repositories](#repositories)
- [Quick start (Docker)](#quick-start-docker)
- [Demo accounts](#demo-accounts)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Demo data](#demo-data)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Features](#features)
- [API overview](#api-overview)
- [Scripts](#scripts)
- [Testing](#testing)
- [Known limitations and next steps](#known-limitations-and-next-steps)

---

## Repositories

The working guide for the whole system (how the four repositories fit together, cross-repository changes) is [`workspace/CLAUDE.md`](workspace/CLAUDE.md): copy it to the folder that contains the four clones.

Solvia is split into four independent repositories:

| Repository                  | What it is                                                                  | Dev port | Docker port |
| --------------------------- | --------------------------------------------------------------------------- | -------- | ----------- |
| `solvia-backend` (this one) | Express + Prisma API, scheduled jobs, the docs and the Docker Compose files | 4000     | 4000        |
| `solvia-app`                | Business web app (PWA) used by each business's admins and collectors        | 5173     | 8080        |
| `solvia-admin`              | Platform backoffice (PWA) used by Solvia staff                              | 5175     | 8082        |
| `solvia-landing`            | Public landing page with the "Solicitar acceso" form                        | 5174     | 8081        |

They only talk over HTTP: the frontends call the API through their own `/api` proxy, and link to each other with URLs set by build-time variables. Nothing is shared at build time. Each frontend carries its own copy of the UI kit in `src/ui`.

To work on the whole system, **clone the four repositories side by side** in one folder:

```
solvia/
├── solvia-backend/
├── solvia-app/
├── solvia-admin/
└── solvia-landing/
```

---

## Quick start (Docker)

Requirements: Docker with Docker Compose v2. This repository has two Compose files:

| File                      | Services                                                                                                                                                   | Use it when                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`      | `postgres` + `backend`                                                                                                                                     | You only need the API (for example, to run a frontend with `npm run dev`)                                                                            |
| `docker-compose.full.yml` | Adds `app`, `landing` and `admin` on top of `docker-compose.yml`, built from `${SOLVIA_REPOS_DIR:-..}/solvia-app`, `…/solvia-landing` and `…/solvia-admin` | You want the whole platform. It needs the four repositories cloned side by side, or `SOLVIA_REPOS_DIR` set to the folder that contains the frontends |

```bash
docker compose up -d --build                                                    # API + database
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build   # whole platform
```

`docker-compose.full.yml` is an override: it only declares the three frontend services, so always pass it together with `docker-compose.yml`.

On startup, the backend applies the Prisma migrations, creates (or updates) the platform admin and, if the database has no tenants, loads demo data (`SEED_ON_START=true`).

| Service                                    | Built from           | URL                                                              |
| ------------------------------------------ | -------------------- | ---------------------------------------------------------------- |
| `app`: business web app (full only)        | `solvia-app`         | http://localhost:8080                                            |
| `landing`: public landing page (full only) | `solvia-landing`     | http://localhost:8081                                            |
| `admin`: platform backoffice (full only)   | `solvia-admin`       | http://localhost:8082                                            |
| `backend`: API                             | this repository      | http://localhost:4000/api                                        |
| Swagger UI                                 | –                    | http://localhost:4000/api/docs (raw spec: `/api/docs.json`)      |
| `postgres`: PostgreSQL                     | `postgres:16-alpine` | `localhost:5432` (user `solvia`, password `solvia`, db `solvia`) |

Each frontend repository has its own `Dockerfile` (Node 22 build → nginx 1.27). Its nginx config is rendered from `nginx.conf.template` at container start and proxies `/api` and `/files` to `API_UPSTREAM` (`http://backend:4000` in Compose). URLs between the frontends are build args: `VITE_LANDING_URL` for the app, and `VITE_APP_URL` for the landing and the backoffice. See [ARCHITECTURE.md §15](docs/ARCHITECTURE.md#15-deployment-topology).

To start over with a clean database, run `docker compose down -v` (with the same `-f` flags you started with) and then start again.

> The secrets in the Compose files are for local use only. Change `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and the platform admin password everywhere else.

---

## Demo accounts

Every demo account uses the password **`Password123!`**.

| App        | Account                        | Role                                    |
| ---------- | ------------------------------ | --------------------------------------- |
| Web app    | `admin@bodegasanmartin.pe`     | Business admin (Bodega San Martin)      |
| Web app    | `collector@bodegasanmartin.pe` | Collector (Bodega San Martin)           |
| Backoffice | `admin@solvia.app`             | Platform admin (all businesses)         |
| Web app    | `admin@comercialgrande.pe`     | Business admin (stress data, see below) |
| Web app    | `cobranza@comercialgrande.pe`  | Collector (stress data)                 |

The platform admin can be changed with `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`. Admin and collector accounts for the other two demo businesses are listed in [Demo data](#demo-data). Seeded users don't have to change their password.

Platform and business accounts are completely separate: a business account can't sign in to the backoffice and vice versa.

**Try the onboarding flow:**

1. Open the landing page and click "Solicitar acceso".
2. In the backoffice, open **Solicitudes** and convert the request. The demo data already includes three pending requests.
3. Sign in to the web app with the temporary password shown in the backoffice. You'll be asked to choose a new one.

---

## Local development

Requirements: Node.js 22 (the backend accepts Node 20+) and PostgreSQL 14+. No PostgreSQL installed? `npm run db:local` starts one (PostgreSQL 17 on `localhost:5432`, data in `.local-db/`, gitignored) without Docker; leave it running in its own terminal. With Docker you can also run only the database: `docker compose up -d postgres`.

### 1. Backend (this repository)

```bash
cd solvia-backend
cp .env.example .env          # adjust DATABASE_URL if needed
npm install
npm run db:local              # (separate terminal) local PostgreSQL, if you don't have one
npx prisma migrate deploy     # or `npm run db:migrate` while changing the schema
npm run db:seed               # platform admin + demo tenants, customers, receivables and access requests
npm run dev                   # http://localhost:4000 (auto-reload)
```

### 2. Frontends (their own repositories)

Install and run each frontend in its own repository, cloned next to this one:

```bash
cd ../solvia-app     && npm install && cp .env.example .env && npm run dev   # web app      http://localhost:5173
cd ../solvia-landing && npm install && cp .env.example .env && npm run dev   # landing page http://localhost:5174
cd ../solvia-admin   && npm install && cp .env.example .env && npm run dev   # backoffice   http://localhost:5175
```

Each Vite dev server proxies to `VITE_PROXY_TARGET` (`http://localhost:4000`): the web app proxies `/api` and `/files`, and the backoffice and the landing proxy `/api`. The browser therefore uses same-origin URLs, exactly like the nginx setup in Docker. The landing page's only API call is the access request form (`POST /api/public/access-requests`).

In development, the web app and the backoffice also register their service worker (`devOptions.enabled`), so the PWA install prompt can be tested locally. This generates a `dev-dist/` folder, which is gitignored.

---

## Environment variables

### Backend (`.env`)

| Variable                  | Default                 | Description                                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`           | `development`, `test` or `production`                                                                                                                                                                                                                                                        |
| `PORT`                    | `4000`                  | HTTP port                                                                                                                                                                                                                                                                                    |
| `PUBLIC_API_URL`          | `http://localhost:4000` | Public base URL. Used for absolute links to statements sent via WhatsApp                                                                                                                                                                                                                     |
| `CORS_ORIGINS`            | `http://localhost:5173` | Comma-separated allowed origins. Only relevant when a frontend is served from another origin without the proxy; the Compose files list the six local frontend origins                                                                                                                        |
| `APP_TIMEZONE`            | `America/Lima`          | IANA timezone for due-date calculations and cron schedules                                                                                                                                                                                                                                   |
| `CURRENCY`                | `PEN`                   | ISO 4217 currency for messages and statements                                                                                                                                                                                                                                                |
| `DATABASE_URL`            | –                       | PostgreSQL connection string (**required**)                                                                                                                                                                                                                                                  |
| `JWT_ACCESS_SECRET`       | –                       | Access-token secret, at least 32 characters (**required**)                                                                                                                                                                                                                                   |
| `JWT_REFRESH_SECRET`      | –                       | Refresh-token secret, at least 32 characters (**required**)                                                                                                                                                                                                                                  |
| `JWT_ACCESS_EXPIRES_IN`   | `15m`                   | Access-token lifetime (tenant and platform tokens)                                                                                                                                                                                                                                           |
| `JWT_REFRESH_EXPIRES_IN`  | `7d`                    | Refresh-token lifetime (tenant and platform tokens)                                                                                                                                                                                                                                          |
| `BCRYPT_SALT_ROUNDS`      | `10`                    | bcrypt cost factor                                                                                                                                                                                                                                                                           |
| `STORAGE_DIR`             | `./storage`             | Directory for payment proofs and generated statements                                                                                                                                                                                                                                        |
| `MAX_UPLOAD_SIZE_MB`      | `5`                     | Maximum payment proof size                                                                                                                                                                                                                                                                   |
| `JOBS_ENABLED`            | `false`                 | Enables the scheduled jobs (`true` in `.env.example` and Docker)                                                                                                                                                                                                                             |
| `REMINDER_CRON`           | `0 * * * *`             | Reminder engine schedule (hourly)                                                                                                                                                                                                                                                            |
| `MONTHLY_REPORT_CRON`     | `30 23 * * *`           | Daily check; the report is generated only on the last day of the month                                                                                                                                                                                                                       |
| `WHATSAPP_PROVIDER`       | `mock`                  | `mock` \| `meta` \| `dialog360` \| `twilio` (only `mock` is implemented)                                                                                                                                                                                                                     |
| `PAYMENT_PROVIDER`        | `mock`                  | `mock` \| `culqi` \| `mercadopago` (only `mock` is implemented)                                                                                                                                                                                                                              |
| `SELF_SIGNUP_ENABLED`     | `false`                 | When `false` (managed onboarding), `POST /auth/register` returns `403 SIGNUP_DISABLED` and Google sign-in only signs in existing users (`403 GOOGLE_ACCOUNT_NOT_FOUND` for new emails). Set `true` to allow self-service sign-up again. Not set in the Compose files, so the default applies |
| `GOOGLE_CLIENT_ID`        | –                       | Optional. OAuth "Web application" client ID; enables "Sign in with Google" in the web app. Add the web origin (e.g. `http://localhost:5173`) to its _Authorized JavaScript origins_                                                                                                          |
| `SEED_ON_START`           | `false`                 | Seeds on startup: upserts the platform admin and loads demo data when the database has no tenants                                                                                                                                                                                            |
| `PLATFORM_ADMIN_EMAIL`    | `admin@solvia.app`      | Optional. Backoffice admin created or updated by the seed                                                                                                                                                                                                                                    |
| `PLATFORM_ADMIN_PASSWORD` | `Password123!`          | Optional. Its password; it must satisfy the [password policy](#features) or the seed fails                                                                                                                                                                                                   |

`.env.example` also lists commented placeholders for the real provider credentials: `WHATSAPP_META_ACCESS_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_API_VERSION`, `WHATSAPP_360DIALOG_API_KEY`, `TWILIO_*`, `CULQI_*` and `MERCADOPAGO_ACCESS_TOKEN`. The code doesn't read them yet.

Environment variables are validated with zod when the server starts (`src/config/env.ts`). Invalid or missing values stop the process with a descriptive message.

### Frontends (`.env` in each frontend repository)

Each frontend repository has its own `.env.example`, and its README documents it. `VITE_*` values are inlined **at build time**. In Docker they are build args.

| Variable            | Projects            | Default (`.env.example`) | Description                                                                                                                                                     |
| ------------------- | ------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`      | app, admin, landing | `/api`                   | API base URL (keep `/api` to use the proxy)                                                                                                                     |
| `VITE_PROXY_TARGET` | app, admin, landing | `http://localhost:4000`  | Dev-server proxy target                                                                                                                                         |
| `VITE_CURRENCY`     | app, admin, landing | `PEN`                    | Currency used to format amounts and prices                                                                                                                      |
| `VITE_LANDING_URL`  | app                 | `http://localhost:5174`  | Landing page; the sign-in page's "Solicita acceso" link goes to `${VITE_LANDING_URL}/#solicitar-acceso`                                                         |
| `VITE_APP_URL`      | landing, admin      | `http://localhost:5173`  | Web app. The landing's "Iniciar sesión" buttons, the backoffice's "Open the app" link and the sign-in URL in the temporary-password WhatsApp message point here |

At runtime, the nginx images read `API_UPSTREAM` (default `http://backend:4000`): the origin they proxy `/api` and `/files` to.

---

## Demo data

The seed script (`npm run db:seed`) creates the platform admin, three tenants and four access requests. Every user has the password **`Password123!`**.

| Tenant (plan)                               | Admin                          | Collector                          |
| ------------------------------------------- | ------------------------------ | ---------------------------------- |
| Bodega San Martin (retail, `starter`)       | `admin@bodegasanmartin.pe`     | `collector@bodegasanmartin.pe`     |
| Ferreteria El Constructor (hardware, `pro`) | `admin@elconstructor.pe`       | `collector@elconstructor.pe`       |
| Distribuidora Andina (wholesale, `free`)    | `admin@distribuidoraandina.pe` | `collector@distribuidoraandina.pe` |

Platform admin (backoffice): `admin@solvia.app` / `Password123!`, or `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` when set. It is upserted on every seed run, so changing the variables and re-running the seed updates the account.

**Access requests** (backoffice → Solicitudes):

- **Pending:** Botica Santa Rosa (message mentions the Starter plan), Ferreteria Norte Trujillo (Pro) and Restaurante La Sazon de Mama.
- **Dismissed:** Minimarket Los Olivos.

Each customer follows a payment profile: punctual, late payer, defaulter, new or mixed. Dates are relative to the day you seed, so you always get:

- receivables in every status (pending, partial, paid, overdue)
- a spread of risk scores (low, medium and high)
- receivables inside every reminder window: 1–3 days before the due date, due today, and overdue
- last month's report on the dashboard

Tenant demo data is only loaded into a database without tenants. `npm run db:seed -- --force` deletes all tenants (and everything they own) and all access requests, then seeds again.

**Stress data** (`npm run db:seed:stress`, `src/database/seedStress.ts`): one big wholesale business, **Comercial Grande SAC** (`pro`), with `admin@comercialgrande.pe` and `cobranza@comercialgrande.pe` (collector), both with `Password123!`. It has 1,000 customers (Peruvian names, `+51 9…` mobiles, DNI or RUC with a valid check digit), 15,000 receivables issued over the last 24 months and the next month (S/ 50–8,000, terms of 7–60 days, so due dates reach about 3 months ahead), about 20,000 payments following punctual, late, partial and defaulter profiles (Yape, Plin, transfer and cash, fewer on weekends), 100 WhatsApp notifications and last month's report. `paidAmount` and `status` match the payments and today's date. It runs in a few seconds, is deterministic (seeded random generator, dates relative to today) and only deletes and recreates that tenant, so the regular demo data is kept. Use it to check the dashboards with a lot of data.

---

## Project structure

```
solvia-backend/
├── prisma/
│   ├── schema.prisma              # Data model
│   └── migrations/                # Versioned SQL migrations
├── src/
│   ├── app.ts / server.ts         # Express app and bootstrap (HTTP + scheduler)
│   ├── config/                    # env validation, OpenAPI definition
│   ├── routes/                    # Express routers with @openapi annotations
│   │                              #   (platform.routes.ts = /api/admin, public.routes.ts = /api/public)
│   ├── controllers/               # HTTP layer: parse input (zod) → call service
│   ├── services/                  # Business logic (auth, user management, access requests, payments, ...)
│   ├── repositories/              # Data access (tenant-scoped Prisma client; platform repos use basePrisma)
│   ├── domain/                    # Pure functions: risk score, reminder rules, temporary passwords, ...
│   ├── providers/whatsapp|payment # Provider interfaces + mock implementations
│   ├── jobs/                      # Cron scheduler, reminder and monthly report jobs
│   ├── middleware/                # auth (tenant + platform), tenant scope, rate limit, uploads, errors
│   ├── validators/                # zod schemas (incl. the password policy)
│   ├── errors/                    # AppError (status + stable code)
│   ├── lib/                       # Prisma clients, tenant context, rate limiter, dates, money, logger
│   └── database/seed.ts           # Platform admin + demo data
├── tests/                         # Vitest unit tests
├── docs/                          # System documentation (architecture, development, maintenance)
├── .github/workflows/ci.yml       # CI: lint, format check, typecheck, tests, build
├── Dockerfile                     # API image (runs migrations on start)
├── docker-compose.yml             # postgres + backend
├── docker-compose.full.yml        # Override: adds the three frontends (${SOLVIA_REPOS_DIR:-..}/solvia-*)
└── README.md
```

Each frontend repository (`solvia-app`, `solvia-admin`, `solvia-landing`) has its own `package.json` + `package-lock.json`, ESLint/Prettier/TS config, `vite.config.ts`, `Dockerfile` + `nginx.conf.template`, `.env.example` and `src/ui` (its own copy of the UI kit). See each one's README.

---

## Architecture

### Multi-tenancy

Every tenant-owned table has a `tenantId` column (`Payment` and `Notification` are scoped through their receivable). Isolation is enforced in one place, not in every query:

1. `authenticate` verifies the tenant JWT and reads `tenantId` and `role` from it.
2. `tenantScope` opens an `AsyncLocalStorage` context holding the tenant for the rest of the request.
3. The **tenant-scoped Prisma client** (`src/lib/prisma.ts`) is a Prisma query extension:
   - It adds the tenant filter to the `where` of every read, update and delete.
   - It adds `tenantId` to every create.
   - It rejects writes that reference a receivable from another tenant.
   - It **throws** if a scoped model is queried without a tenant context (fail-closed).

Only authentication, tenant creation, access requests, job orchestration, the platform backoffice and the seed script use the unscoped `basePrisma` client. When the backoffice manages a tenant's users, it runs the same user-management service inside `runWithTenant(tenantId, ...)`. Scheduled jobs loop over **active** tenants and run each tenant's work inside its own context, reusing the same services as the API.

### Managed onboarding

Self sign-up is **off** by default (`SELF_SIGNUP_ENABLED=false`). The flow is:

1. A visitor fills in the landing page's **Solicitar acceso** form, which calls `POST /api/public/access-requests`. The request is stored as `pending`.
2. A platform admin reviews it in the backoffice (**Solicitudes**) and converts it with **Nueva empresa** (`POST /api/admin/tenants` with `accessRequestId`). That creates the tenant, its first admin with a generated **temporary password** (shown once), the default templates and the reminder rules, and marks the request `converted`.
3. The platform admin shares the password (copy, or WhatsApp).
4. At first sign-in, the user's access token carries a "password change required" claim. Every tenant route answers `403 PASSWORD_CHANGE_REQUIRED` until the user calls `POST /api/auth/change-password`, and the web app sends them to `/change-password`.
5. The business admin adds collectors and other admins in **Settings → Users** (`POST /api/users`). Each new user gets a temporary password and goes through the same first sign-in.

Details and a sequence diagram: [ARCHITECTURE.md §5.4](docs/ARCHITECTURE.md#54-managed-onboarding).

### Platform backoffice

Solvia staff sign in to the backoffice with a `PlatformAdmin` account (not a tenant user). The `/api/admin/*` routes use their own tokens (`type: platform_access`, audience `solvia-platform`). Tenant tokens are rejected there, and platform tokens are rejected by every tenant route.

Admins can:

- see platform-wide metrics, including pending access requests
- list and inspect businesses, and create new ones
- manage each business's users
- change a business's plan, and suspend or reactivate it
- review access requests

Users of a **suspended** tenant can't log in or refresh their session (`403 TENANT_SUSPENDED`), and scheduled jobs skip suspended tenants. A **deactivated** user gets `403 USER_DISABLED` on login and refresh.

### Reminder engine

`jobs/reminder.job.ts` runs hourly. For each active tenant it:

1. marks unpaid receivables past their due date as `overdue`;
2. loads the tenant's rules (`ReminderSettings`, editable in **Settings**);
3. runs `determineReminder()` (a pure function in `domain/reminderRules.ts`) on each unpaid receivable:
   - **Pre-due:** once, when the due date is 1–N days away (default 3).
   - **Due date:** once, on the due date.
   - **Overdue:** every N days after the due date while unpaid (default 3). If the job missed a day, it catches up.
4. renders the tenant's template, adds a payment link from the `PaymentProvider`, sends it through the `WhatsAppProvider`, and logs the attempt (`sent` or `failed`) in `Notification`.

The decision depends on the last successful send of each type, so the engine is idempotent: running it many times a day never duplicates a reminder. You can also trigger it from **Settings → Run reminders now** (`POST /api/reminders/run`) or send one reminder from any receivable row.

### Providers

```ts
interface WhatsAppProvider {
  send(
    to: string,
    template: WhatsAppTemplate,
    variables: TemplateVariables,
  ): Promise<WhatsAppSendResult>;
}

interface PaymentProvider {
  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink>;
}
```

- `MockWhatsAppProvider` renders the message and prints it to the console.
- `MockPaymentProvider` returns a fake checkout URL.

To add a real integration, implement the interface (for example `MetaCloudWhatsAppProvider` or `CulqiPaymentProvider`) and register it in `providers/*/index.ts`. If a provider is configured but not implemented, the app stops at startup instead of failing mid-request.

### Risk score

The risk score is computed on the fly (`domain/riskScore.ts`) from the customer's receivables. Three signals each add 0–2 points:

| Signal                                                      | +1 point | +2 points |
| ----------------------------------------------------------- | -------- | --------- |
| Share of receivables paid in full on or before the due date | < 80%    | < 50%     |
| Average days late (settled and still-unpaid receivables)    | > 7 days | > 30 days |
| Receivables overdue right now                               | ≥ 1      | ≥ 3       |

The total gives the level: **0–1 low**, **2–3 medium**, **4–6 high**. Receivables that aren't due yet are ignored, and a customer with no history is low risk.

### Error format

Every error response has the same shape, with a **stable, machine-readable `code`**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "phone", "message": "..." }]
  }
}
```

Services throw `new AppError(status, 'CODE', 'English message')` (for example `PAYMENT_EXCEEDS_BALANCE`, `EMAIL_TAKEN`, `PASSWORD_CHANGE_REQUIRED`). Each frontend translates known codes (`errors.codes.*` in its `src/ui/i18n/messages.ts`) and falls back to the server message for unknown ones.

---

## Features

1. **Auth and multi-tenancy:** login, refresh tokens, `admin` and `collector` roles. Self-service business registration (business name, optional industry, `plan` default `free`) exists but is off unless `SELF_SIGNUP_ENABLED=true`. When it is off, the web app hides the sign-up tab and links to the landing page's request form instead.
2. **Managed onboarding:** landing-page access requests, a backoffice inbox, business creation with a first admin, **temporary passwords** (12 random characters that meet the policy, without ambiguous characters, shown once, shareable via WhatsApp) and a **forced password change** at first sign-in.
3. **Team management:** in the web app (Settings → Users, admins only) and in the backoffice (per business), you can add users, rename them, change their role, deactivate or reactivate them, and reset their password. A user can't change their own role or deactivate themselves (`CANNOT_MODIFY_SELF`), and a business always keeps one active admin (`LAST_ADMIN`). The team list shows each user's status (active, pending first sign-in, disabled), Google link and last sign-in.
4. **Sign in with Google (optional):** enabled when `GOOGLE_CLIENT_ID` is set (`GET /api/auth/config` tells the web app). An existing account with the same verified email is linked automatically. An unknown email is rejected (`GOOGLE_ACCOUNT_NOT_FOUND`) unless self sign-up is enabled; in that case it is asked for a business name once and gets a new business.
5. **Password policy** for new passwords: at least 8 characters, 1 uppercase letter, 1 number and 1 special character. It is enforced by zod on the backend and shown as a live checklist in the forms. The new password must differ from the current one (`PASSWORD_REUSED`).
6. **Customers and receivables:** full CRUD, search, filters and server-side sorting, partial or full payments, optional proof upload (JPEG/PNG/WEBP/PDF).
7. **Automatic reminders:** an hourly engine with configurable rules and editable templates (with a reset to the default text). Templates can use `{{name}}`, `{{amount}}`, `{{date}}`, `{{description}}`, `{{daysOverdue}}`, `{{paymentLink}}` and `{{business}}`.
8. **Account statements:** a PDF with the Solvia header, a summary, the receivables and the payment history. It is sent automatically after each payment, and is also available on demand.
9. **Payment links:** generated per receivable, included in reminders, and copyable from the UI.
10. **Dashboard:** outstanding/overdue totals, collections this month vs the same point last month, amounts due in the next 7 days, aging buckets, 6-month collection trend, top debtors, risk distribution, overdue alerts and the latest monthly report.
11. **Projected cash flow:** outstanding amounts grouped by week or month of due date, shown as a bar chart with a table view. Overdue amounts are reported separately.
12. **Risk score:** a badge in the customer list and in the customer detail view.
13. **Monthly report:** generated on the last day of each month (total collected, total pending, top 5 overdue customers) and shown on the dashboard. Admins can also generate one on demand.
14. **Help and onboarding:** help center, guided tour, and the "Bowl" assistant menu (the owl mascot) in the top bar.
15. **Platform backoffice:**
    - overview with charts (plan mix, sign-ups, collections, top tenants) and a pending-requests KPI
    - businesses table with search, filters and sorting, and "Nueva empresa"
    - business detail with user management, plan changes and suspend/reactivate
    - **Solicitudes** inbox: convert, dismiss or restore requests, and contact the requester by WhatsApp or email
16. **Public landing page:**
    - sections: hero, features, how it works, Bowl, pricing, FAQ
    - a "Solicitar acceso" modal form (honeypot, rate-limited), with `#solicitar-acceso` and `#solicitar-acceso-<plan>` deep links
    - "Iniciar sesión" buttons that open the web app
17. **Across all frontends:** Spanish/English, light/dark/system theme, a responsive layout (bottom sheets, and bottom navigation on phones) and reduced-motion support. The web app and the backoffice are installable PWAs with an update prompt.

---

## API overview

All routes are under `/api`. The complete, interactive reference is at **`/api/docs`**.

- **Public:** `health`, `auth/register`, `auth/login`, `auth/google`, `auth/config`, `auth/refresh` and `public/access-requests`.
- **Tenant routes** require `Authorization: Bearer <accessToken>` with a **tenant** token. While the user must change a temporary password, only `GET /auth/me` and `POST /auth/change-password` accept the token; every other tenant route answers `403 PASSWORD_CHANGE_REQUIRED`.
- **`/admin/*` routes** (except `admin/auth/login` and `admin/auth/refresh`) require a **platform** token.

### Public API

| Method | Path                      | Description                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/public/access-requests` | Landing "request access" form: `{ businessName, contactName, email, phone, industry?, message?, website }`. `website` is a honeypot: when it is filled, the API answers `201` and stores nothing. A second request for an email that already has a pending one is not duplicated. Limited to 5 per hour per IP (`429 TOO_MANY_REQUESTS` with `Retry-After`) |

### Business (tenant) API

| Method             | Path                                                                                  | Description                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST               | `/auth/register`                                                                      | Self-service sign-up; `403 SIGNUP_DISABLED` unless `SELF_SIGNUP_ENABLED=true`                                                                                                                                     |
| POST               | `/auth/login` · `/auth/refresh`                                                       | Session management (`403 USER_DISABLED` / `403 TENANT_SUSPENDED`). The session user includes `mustChangePassword`                                                                                                 |
| POST               | `/auth/google`                                                                        | Sign in with a Google ID token (`{ credential, businessName?, industry? }`). It returns a session, `{ needsRegistration: true, profile }` (only with self sign-up) or `403 GOOGLE_ACCOUNT_NOT_FOUND`              |
| GET                | `/auth/config`                                                                        | Public auth configuration: `{ googleClientId, signupEnabled }` (`googleClientId` is `null` when Google is disabled)                                                                                               |
| GET                | `/auth/me`                                                                            | Current user (incl. `mustChangePassword`) and tenant                                                                                                                                                              |
| POST               | `/auth/change-password`                                                               | `{ currentPassword?, newPassword }` → new session without the "change required" claim (`401 INVALID_CREDENTIALS`, `400 PASSWORD_REUSED`)                                                                          |
| GET, POST          | `/users`                                                                              | Team of the business, admins first; add a user `{ name, email, role }` → `{ user, temporaryPassword }` (admin)                                                                                                    |
| PATCH              | `/users/:id`                                                                          | `{ name?, role?, active? }` (admin; `CANNOT_MODIFY_SELF`, `LAST_ADMIN`, `USER_NOT_FOUND`)                                                                                                                         |
| POST               | `/users/:id/reset-password`                                                           | New temporary password `{ temporaryPassword }` (admin; not for yourself)                                                                                                                                          |
| GET, POST          | `/customers`                                                                          | List (filters: `search`, `risk`; sort: `sortBy=name\|createdAt\|outstanding\|risk`, `sortDir`) and create                                                                                                         |
| GET, PATCH, DELETE | `/customers/:id`                                                                      | Detail with receivables and payments, update, delete (admin)                                                                                                                                                      |
| GET                | `/customers/:id/risk`                                                                 | Risk score                                                                                                                                                                                                        |
| GET                | `/customers/:id/statement`                                                            | PDF account statement                                                                                                                                                                                             |
| POST               | `/customers/:id/statement/send`                                                       | Generate and send the statement via WhatsApp                                                                                                                                                                      |
| GET, POST          | `/receivables`                                                                        | List (filters: `status` (one or comma-separated), `customerId`, `search`, `dueFrom`, `dueTo`; sort: `sortBy=dueDate\|issueDate\|totalAmount\|description\|status\|customer\|createdAt`, `sortDir`) and create     |
| GET, PATCH, DELETE | `/receivables/:id`                                                                    | Detail, update, delete (admin)                                                                                                                                                                                    |
| GET, POST          | `/receivables/:id/payments`                                                           | Payments (`multipart/form-data` with optional `proof`)                                                                                                                                                            |
| POST               | `/receivables/:id/payment-link`                                                       | Online payment link                                                                                                                                                                                               |
| POST               | `/receivables/:id/remind`                                                             | Send a reminder now                                                                                                                                                                                               |
| GET                | `/dashboard/summary` · `/dashboard/cash-flow`                                         | Dashboard data (summary includes aging, trend, top debtors, risk distribution)                                                                                                                                    |
| GET                | `/dashboard/analytics`                                                                | Period analytics: `from`, `to` (inclusive, default month to date), `granularity` (`day`\|`week`\|`month`, auto by default). KPIs vs the previous period, series, payment methods, weekdays, top payers, reminders |
| GET                | `/dashboard/concentration`                                                            | Pareto / ABC of the debtors: classes A (80%), B (95%), C, concentration curve and the `limit` (default 20) largest debtors                                                                                        |
| GET, POST          | `/reports/monthly` · `/reports/monthly/generate` (admin) · `/reports/monthly/:period` | Monthly reports                                                                                                                                                                                                   |
| GET, PUT           | `/settings/templates` · `/settings/templates/:type` (PUT admin)                       | Message templates                                                                                                                                                                                                 |
| POST               | `/settings/templates/:type/reset`                                                     | Restore a template's default text (admin)                                                                                                                                                                         |
| GET, PUT           | `/settings/reminders` (PUT admin)                                                     | Reminder rules                                                                                                                                                                                                    |
| GET                | `/notifications`                                                                      | Message send log (filters: `receivableId`, `customerId`, `status`)                                                                                                                                                |
| POST               | `/reminders/run`                                                                      | Run the reminder engine now (admin)                                                                                                                                                                               |

List endpoints accept `page` and `pageSize` (max 100) and return `{ data, meta: { page, pageSize, total, totalPages } }`. `GET /users` returns a plain array.

### Platform backoffice API (`/api/admin`)

| Method     | Path                                              | Description                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST       | `/admin/auth/login` · `/admin/auth/refresh`       | Platform admin session (separate tokens)                                                                                                                                                                                            |
| GET        | `/admin/auth/me`                                  | Current platform admin                                                                                                                                                                                                              |
| GET        | `/admin/overview`                                 | Totals (incl. `pendingAccessRequests`), tenants by plan, 12-month sign-ups, 6-month collections, top tenants by outstanding balance. Optional `from`, `to`, `granularity` add `period`, `periodTotals` and `periodSeries`           |
| GET        | `/admin/tenants`                                  | Tenants with usage metrics (filters: `search` (name or any user email), `plan`, `status`; sort: `sortBy=name\|createdAt\|outstanding\|customers\|users`, `sortDir`; pagination)                                                     |
| POST       | `/admin/tenants`                                  | Create a business and its first admin: `{ name, industry?, plan?, admin: { name, email }, accessRequestId? }` → `{ tenant, temporaryPassword }` (`409 EMAIL_TAKEN`, `404 ACCESS_REQUEST_NOT_FOUND`, `400 ACCESS_REQUEST_CONVERTED`) |
| GET, PATCH | `/admin/tenants/:id`                              | Tenant detail with its users; change `plan` and/or `status` (`active` \| `suspended`)                                                                                                                                               |
| POST       | `/admin/tenants/:id/users`                        | Add a user with a temporary password                                                                                                                                                                                                |
| PATCH      | `/admin/tenants/:id/users/:userId`                | Rename, change role, activate/deactivate (`LAST_ADMIN` applies)                                                                                                                                                                     |
| POST       | `/admin/tenants/:id/users/:userId/reset-password` | New temporary password                                                                                                                                                                                                              |
| GET        | `/admin/access-requests`                          | Access requests, newest first (filters: `status` = `pending` \| `converted` \| `dismissed`, `search` (business, contact, email or phone); pagination)                                                                               |
| PATCH      | `/admin/access-requests/:id`                      | `{ status: 'pending' \| 'dismissed' }`; converted requests can't change (`400 ACCESS_REQUEST_CONVERTED`)                                                                                                                            |

---

## Scripts

| Backend (this repository)                                             |                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                                                         | Start with auto-reload (tsx)                                                         |
| `npm run db:local`                                                    | Local PostgreSQL 17 on :5432 without Docker (data in `.local-db/`)                   |
| `npm run db:studio`                                                   | Browse and edit the database in the browser (Prisma Studio, http://localhost:5555)   |
| `npm run build` / `npm start`                                         | Compile to `dist/` and run                                                           |
| `npm run db:migrate`                                                  | Create and apply a migration (development, interactive)                              |
| `npm run db:deploy`                                                   | Apply pending migrations                                                             |
| `npm run db:seed`                                                     | Platform admin + demo data (`-- --force` to reset tenants and access requests first) |
| `npm run db:seed:stress`                                              | (Re)create the big "Comercial Grande SAC" tenant for load checks (other data kept)   |
| `npm run db:reset`                                                    | Drop, re-migrate and seed the database (**destructive**, development only)           |
| `npm run prisma:generate`                                             | Regenerate the Prisma client                                                         |
| `npm test` / `npm run test:watch`                                     | Unit tests                                                                           |
| `npm run lint` · `lint:fix` · `format` · `format:check` · `typecheck` | Code quality                                                                         |

Every frontend repository (`solvia-app`, `solvia-admin`, `solvia-landing`) has the same scripts:

| Frontend (each repository)                              |                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                                           | Dev server (app 5173, landing 5174, backoffice 5175)                        |
| `npm run build`                                         | `tsc -b && vite build` → `dist/`                                            |
| `npm run preview`                                       | Serve the production build                                                  |
| `npm run typecheck`                                     | `tsc -b --noEmit`                                                           |
| `npm run lint` · `lint:fix` · `format` · `format:check` | Code quality (each project has its own ESLint and Prettier config)          |
| `npm run icons`                                         | App and backoffice only: regenerate the PWA icons from `public/favicon.svg` |

---

## Testing

```bash
npm test
```

Unit tests in `tests/` cover the pure logic; they don't need a database:

- `riskScore.test.ts`: risk score calculation
- `reminderRules.test.ts`: reminder engine rules (windows, idempotency, catch-up, disabled rules, paid/partial receivables)
- `domain.test.ts`: receivable status derivation, template rendering, cash-flow bucketing and date helpers
- `portfolio.test.ts`: dashboard aging buckets, monthly series and top debtors
- `analytics.test.ts`: period analytics (defaults, auto granularity, previous period, range validation, bucket generation with zero-fill and clipping, ISO weekdays, breakdowns) and the pre-aggregated inputs of aging, cash flow and risk
- `analyticsRepository.test.ts`: every raw dashboard query filters by the current tenant and fails without a tenant context
- `passwordPolicy.test.ts`: the password policy
- `googleSignIn.test.ts`: the Google sign-in decision (sign in, link, register, needs registration, unknown account when sign-up is disabled)
- `platform.test.ts`: backoffice aggregations (monthly counts/amounts, plan breakdown, balances, sorting, top tenants)
- `platformTokens.test.ts`: tenant and platform tokens are not interchangeable
- `temporaryPassword.test.ts`: generated temporary passwords (length, character sets, policy)
- `userManagement.test.ts`: team rules (`CANNOT_MODIFY_SELF`, `LAST_ADMIN`, password resets)
- `accessRequest.test.ts`: the access request input schema
- `rateLimit.test.ts`: the in-memory sliding-window rate limiter

The frontends have no automated tests yet; see the manual smoke test in the [development guide](docs/DEVELOPMENT_GUIDE.md#manual-ui-smoke-test).

### Continuous integration

Every repository has a GitHub Actions workflow, `.github/workflows/ci.yml`. It runs on pushes to `main` and on pull requests, on Node 22 with the npm cache:

| Repository                                     | Steps                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solvia-backend`                               | `npm ci`, `npx prisma generate`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` (with dummy `DATABASE_URL` and JWT secrets; no database is started), `npm run build` |
| `solvia-app`, `solvia-admin`, `solvia-landing` | `npm ci`, `npm run lint`, `npm run format:check`, `npm run build` (which type-checks with `tsc -b`)                                                                                           |

---

## Known limitations and next steps

- **Real providers:** only the mock WhatsApp and payment providers exist. Next are adapters for Meta Cloud API, 360dialog or Twilio, and for Culqi or Mercado Pago, plus payment webhooks to reconcile online payments automatically.
- **Refresh tokens are stateless:** they can't be revoked individually. A persisted token store with rotation is recommended before production.
- **Suspension and deactivation are not instant:** suspending a tenant or deactivating a user blocks login and refresh, but access tokens already issued stay valid until they expire (`JWT_ACCESS_EXPIRES_IN`, 15 minutes by default).
- **Temporary passwords are shared by hand:** the platform or business admin copies them or sends them via WhatsApp. There is no email delivery and no self-service password reset (both need an email provider).
- **Google-only accounts** have no password. The API lets them set one without `currentPassword`, but the web app's change-password form always sends the field, so an empty value fails validation.
- **The access-request rate limit is in memory** (per API process). With several replicas, each one counts separately; use a shared store (e.g. Redis) then. Login endpoints are not rate-limited yet.
- **Plans are labels:** the plan (`free`, `starter`, `pro`) is stored and editable from the backoffice, and the landing page shows limits and prices, but the backend doesn't enforce any plan limit yet.
- **Platform admins** are created only by the seed (one account); there is no API to manage them.
- **The UI kit is copied, not shared:** each frontend has its own `src/ui`, so kit changes must be applied to every project that needs them (see [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md#change-the-ui-kit-srcui)).
- **File storage is local disk:** proofs and statements are served under `/files` with random, unguessable names. Move them to object storage (S3/GCS) with signed URLs for production.
- **Monthly report delivery** by WhatsApp or email is a later phase; for now the report is shown on the dashboard.
- **Risk filter performance:** the risk score is computed in memory, so filtering or sorting customers by risk or outstanding balance evaluates every matching customer. The backoffice's "sort by outstanding" works the same way. That is fine for SMB volumes; cache or precompute it if tenants grow large.
- **Dev dependency advisory:** `npm audit` reports a moderate advisory in Vitest's mocker. It affects only the test runner and is fixed in Vitest 4, whose peer dependencies currently fail to resolve with npm 10 in this setup. The Prisma CLI advisory is fixed through an `overrides` entry for `deepmerge-ts`.
