# Maintenance guide

How to operate, update and troubleshoot Solvia over time. Paths without a prefix are relative to the root of `solvia-backend`; frontend paths start with the repository name (`solvia-app/…`).

- [1. Routine tasks](#1-routine-tasks)
- [2. Database and migrations](#2-database-and-migrations)
- [3. Backups and restore](#3-backups-and-restore)
- [4. Dependency management](#4-dependency-management)
- [5. Deploying to production](#5-deploying-to-production)
- [6. Scaling](#6-scaling)
- [7. Monitoring and logs](#7-monitoring-and-logs)
- [8. Security hardening backlog](#8-security-hardening-backlog)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Repositories](#10-repositories)

---

## 1. Routine tasks

| Frequency    | Task                         | How                                                                                                                                                                            |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every change | Lint, typecheck, test, build | CI runs it on every push and pull request; see [DEVELOPMENT_GUIDE.md §7](DEVELOPMENT_GUIDE.md#7-before-you-commit-and-ci)                                                      |
| Daily (prod) | Database backup              | `pg_dump` (see [§3](#3-backups-and-restore))                                                                                                                                   |
| Daily (prod) | Check the reminder job ran   | Logs contain `[reminders] N tenant(s) processed ... sent, ... failed` every hour                                                                                               |
| Weekly       | Review failed notifications  | `GET /api/notifications?status=failed` or the Settings send log                                                                                                                |
| Daily        | Answer access requests       | Backoffice → Solicitudes (the overview KPI shows how many are pending): convert or dismiss them                                                                                |
| Weekly       | Review businesses            | Backoffice overview and businesses list: new businesses, suspended tenants, large overdue balances, users that never completed their first sign-in (team status "Por activar") |
| Monthly      | Dependency audit             | `npm audit` and `npm outdated` in each of the four repositories                                                                                                                |
| Month end    | Monthly reports generated    | Logs contain `[monthly-report] Generated YYYY-MM report`; the dashboard shows the new period                                                                                   |
| Quarterly    | Rotate secrets               | JWT secrets and the platform admin password; see [§8](#8-security-hardening-backlog)                                                                                           |
| As needed    | Clean old files              | Old statements in `STORAGE_DIR/statements` can be deleted: each one is regenerated on demand                                                                                   |

---

## 2. Database and migrations

Prisma Migrate manages the schema. Migrations are versioned SQL in `prisma/migrations/`:

| Migration                           | Change                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260923120000_init`               | Initial schema                                                                                                                                          |
| `20260923190000_add_google_sign_in` | `users.googleId` (unique), `users.passwordHash` nullable                                                                                                |
| `20260924100000_add_platform_admin` | `TenantStatus` enum, `tenants.status` (default `active`), `platform_admins` table                                                                       |
| `20260925090000_managed_onboarding` | `AccessRequestStatus` enum, `users.active` (default `true`), `users.mustChangePassword` (default `false`), `users.lastLoginAt`, `access_requests` table |

| Situation                                                               | Command                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change the schema during development (interactive terminal)             | `npx prisma migrate dev --name <short_description>`                                                                                                                                                                                                                                             |
| Change the schema from a non-interactive shell (CI, scripts, AI agents) | `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script --output prisma/migrations/<timestamp>_<name>/migration.sql`, then `npx prisma migrate deploy` (see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md#create-a-migration)) |
| Apply pending migrations (staging/prod/Docker)                          | `npx prisma migrate deploy` (Docker runs it on every start)                                                                                                                                                                                                                                     |
| Check pending migrations                                                | `npx prisma migrate status`                                                                                                                                                                                                                                                                     |
| Regenerate the client after pulling changes                             | `npx prisma generate` (also runs on `npm install`)                                                                                                                                                                                                                                              |
| Wipe the local DB and reapply everything                                | `npx prisma migrate reset` or `npm run db:reset` (**destructive, development only**; it also runs the seed)                                                                                                                                                                                     |

Rules:

1. **Never edit or delete a migration that has been applied** in any shared environment. Fix mistakes with a new migration.
2. **Never use `migrate dev` or `migrate reset` against production.** Only `migrate deploy`.
3. **Destructive changes** (dropping or renaming columns) should be done in two releases:
   - add the new column, deploy code that writes both, and backfill;
   - then remove the old column.

   Prisma treats a rename as drop + add, so edit the generated SQL to use `ALTER TABLE ... RENAME COLUMN` **before** applying it the first time.

4. **Adding a required column** to a table with data needs a `@default(...)`, or a migration that backfills existing rows (as `tenants.status` does with `DEFAULT 'active'`, and `users.active` / `users.mustChangePassword` with `DEFAULT true` / `false`).
5. After adding a tenant-owned model, **register it in `src/lib/prisma.ts`** (see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md#add-a-new-tenant-owned-model)).
6. When generating a migration with `migrate diff --from-schema-datasource`, make sure the database already has every previous migration, or the diff will repeat them.

### Data growth

- `notifications` grows by about one row per reminder. Consider archiving rows older than 12 months. The reminder engine only needs the latest successful send of each type per receivable.
- `monthly_reports` holds one row per tenant per month, which is negligible.
- `platform_admins` holds a handful of rows.
- `access_requests` grows with landing submissions (rate-limited to 5 per hour per IP). Dismissed requests can be deleted after a while; converted ones keep a link to their tenant (`tenantId`, set to `NULL` if the tenant is deleted).
- Uploaded proofs are permanent evidence: back up `STORAGE_DIR/proofs`.

---

## 3. Backups and restore

**What to back up:** the PostgreSQL database **and** the storage directory (`backend-storage` volume or `STORAGE_DIR`). Proof images are not in the database.

```bash
# Backup (Docker Compose)
docker compose exec -T postgres pg_dump -U solvia -d solvia -Fc > solvia-$(date +%F).dump
docker run --rm -v solvia_backend-storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/storage-$(date +%F).tar.gz -C /data .

# Restore
docker compose exec -T postgres pg_restore -U solvia -d solvia --clean --if-exists < solvia-YYYY-MM-DD.dump
docker run --rm -v solvia_backend-storage:/data -v "$PWD":/backup alpine \
  tar xzf /backup/storage-YYYY-MM-DD.tar.gz -C /data
```

Test a restore on a separate machine at least once per quarter. An untested backup is not a backup.

---

## 4. Dependency management

### Four install roots

- Every repository (`solvia-backend`, `solvia-app`, `solvia-admin`, `solvia-landing`) has its own `package.json` and `package-lock.json`. Run `npm install`, `npm audit` and `npm outdated` in each one; CI installs with `npm ci`, so always commit the lockfile.
- Each frontend has its own copy of the tooling (Vite, Tailwind, TypeScript, ESLint, Prettier and, in the app and the backoffice, `vite-plugin-pwa` and `@vite-pwa/assets-generator`). The phone field adds `libphonenumber-js` and `country-flag-icons` to `solvia-app` and `solvia-landing`.
- Nothing forces the three frontends onto the same versions, but the UI kit is copied between them, so **upgrade shared libraries together** (`react`, `react-dom`, `react-router`, `lucide-react`, `tailwindcss`, `vite`; plus `@tanstack/react-query` and `recharts` in app and backoffice). Otherwise a kit file copied from one repository may not compile in another.

### Pinned majors and why

Some packages are intentionally held one major version behind the latest release. The table records what was chosen and what to check before upgrading.

| Package                         | Pinned | Latest seen at build time | Notes before upgrading                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma` / `@prisma/client`     | 6.19   | 7.x / 8.x RC              | Prisma 7 requires a `prisma.config.ts` datasource, driver adapters and the new `prisma-client` generator with an explicit output path. Plan it as its own task: update `schema.prisma`, `lib/prisma.ts`, the Dockerfile `binaryTargets`, and re-verify the tenant extension. `prisma.config.ts` already exists (schema, migrations and seed paths). |
| `typescript`                    | 5.9    | 7.x (native)              | Wait until `typescript-eslint` officially supports it.                                                                                                                                                                                                                                                                                              |
| `eslint`                        | 9      | 10                        | The flat configs (`eslint.config.mjs` here, `eslint.config.js` in each frontend) should mostly carry over; check plugin compatibility (`eslint-plugin-react-hooks`, `react-refresh`).                                                                                                                                                               |
| `vite` / `@vitejs/plugin-react` | 7 / 5  | 8 / 6                     | Check `manualChunks` in each frontend's `vite.config.ts`, the Tailwind plugin and `vite-plugin-pwa` compatibility.                                                                                                                                                                                                                                  |
| `react-router`                  | 7      | 8                         | Imports come from `react-router` (not `react-router-dom`).                                                                                                                                                                                                                                                                                          |
| `vitest`                        | 3.2    | 4.x                       | **Known issue:** installing Vitest 4 crashed npm 10's resolver (`Cannot read properties of null (reading 'edgesOut')`). Retry with a newer npm. Vitest 4 also fixes the remaining moderate `npm audit` advisory (`@vitest/mocker`), which only affects the test runner.                                                                             |
| `dotenv`                        | 16     | 18                        | Newer majors print a banner on load; there's no functional need to upgrade.                                                                                                                                                                                                                                                                         |

### Overrides

`package.json` (backend) has `"overrides": { "deepmerge-ts": "^8.0.2" }` to fix a high-severity advisory in the Prisma CLI's config loader. **Remove it** once Prisma ships a version that depends on `deepmerge-ts >= 8`: run `npm ls deepmerge-ts` and check that no `overridden` marker appears after removing the override.

### Upgrade procedure

1. On a branch: `npm outdated`, then upgrade **one package family at a time** (for example `prisma` together with `@prisma/client`).
2. Read the changelog for breaking changes.
3. Run the full check (`lint`, `typecheck`, `test`, `build`) plus the manual smoke tests in [DEVELOPMENT_GUIDE.md §6](DEVELOPMENT_GUIDE.md#manual-ui-smoke-test).
4. For Prisma, also run `npx prisma validate`, then `migrate deploy` against a copy of production data.
5. For `vite-plugin-pwa` / Workbox, rebuild and test install and update with `npm run build && npm run preview` in `solvia-app` and `solvia-admin` (see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md#test-the-pwa-locally)).
6. Commit the updated `package-lock.json` in the same commit. For a library shared by the frontends, repeat steps 1–6 in each of them.

Keep `prisma` and `@prisma/client` on the **exact same version**.

---

## 5. Deploying to production

Docker Compose works for a single server. For anything larger, use the same images on a container platform with a managed PostgreSQL.

**Images**

| Image      | Build                                                  | Serves                                                                |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| backend    | `Dockerfile`                                           | API on port 4000; runs `prisma migrate deploy` on start               |
| web app    | `solvia-app/Dockerfile` (build arg `VITE_LANDING_URL`) | SPA + proxy of `/api` and `/files` to `API_UPSTREAM`                  |
| backoffice | `solvia-admin/Dockerfile` (build arg `VITE_APP_URL`)   | SPA + proxy of `/api` and `/files` to `API_UPSTREAM`                  |
| landing    | `solvia-landing/Dockerfile` (build arg `VITE_APP_URL`) | Static site + proxy of `/api` (access request form) to `API_UPSTREAM` |

Each frontend image renders `nginx.conf.template` at start and proxies to `API_UPSTREAM` (default `http://backend:4000`, the Compose service name). On another platform, set `API_UPSTREAM` to the API origin (no path), e.g. `docker run -e API_UPSTREAM=https://api.example.com …`. You don't need to rebuild for it, because it is read at container start. Each repository builds and publishes its own image, so they can be deployed independently. Deploy the API first when a release changes the API contract.

**Pre-deploy checklist**

- [ ] `NODE_ENV=production`.
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are long random values (`openssl rand -base64 48`), different from each other, and stored in a secret manager rather than committed.
- [ ] `DATABASE_URL` points to the managed database, with SSL if the provider requires it (`?sslmode=require`).
- [ ] `PUBLIC_API_URL` is the real public HTTPS URL of the API; statement links sent over WhatsApp use it.
- [ ] `CORS_ORIGINS` lists only your frontend origin(s).
- [ ] `SEED_ON_START=false` (demo data must never reach production). See the note below for the platform admin.
- [ ] `SELF_SIGNUP_ENABLED` is left at `false` (managed onboarding) unless you really want public self-service sign-up.
- [ ] `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` are set to a real account with a strong password (never the default `Password123!`).
- [ ] `GOOGLE_CLIENT_ID` (if used) belongs to a production OAuth client whose _Authorized JavaScript origins_ include the web app's public URL.
- [ ] Frontend build args (inlined at build time):
  - `VITE_APP_URL` points to the public web app URL for the landing and backoffice images. The backoffice also puts `${VITE_APP_URL}/login` in the temporary-password WhatsApp message.
  - `VITE_LANDING_URL` points to the public landing URL for the web app image ("Solicita acceso" link).
- [ ] `API_UPSTREAM` is set on every frontend container.
- [ ] The access-request rate limit counts per API process and per client IP. Behind more than one proxy hop, adjust `trust proxy` in `src/app.ts`, or every request will look like it comes from the proxy.
- [ ] `STORAGE_DIR` is on a persistent volume, or has been migrated to object storage.
- [ ] `JOBS_ENABLED=true` on **exactly one** backend instance (see [§6](#6-scaling)).
- [ ] `WHATSAPP_PROVIDER` and `PAYMENT_PROVIDER` are set to real adapters, with credentials.
- [ ] HTTPS is terminated in front of nginx or the load balancer. `app.set('trust proxy', 1)` is already set for one proxy hop. HTTPS is also required for the PWA (service worker and install).
- [ ] The backoffice is only reachable by staff (for example behind a VPN, an IP allowlist or an identity-aware proxy), in addition to its own login.
- [ ] Backups are scheduled and a restore has been tested.

**Creating the platform admin without demo data.** With `SEED_ON_START=false`, nothing creates the platform admin. Running `npm run db:seed` on an empty production database would also load the demo tenants, so run only the platform-admin part inside the backend container (it upserts, so it is also how you change the admin's password):

```bash
docker compose exec backend node -e "require('./dist/database/seed').seedPlatformAdmin().finally(() => process.exit())"
```

It uses `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` from the container environment; the password must satisfy the password policy.

**Deploy steps**

1. Build the images: `docker build` in each repository, `docker compose -f docker-compose.yml -f docker-compose.full.yml build` locally, or in your CI.
2. Take a database backup.
3. Start the new backend. Its entrypoint runs `prisma migrate deploy` before serving.
4. Check `GET /api/health`. Then log in to the web app and open the dashboard, log in to the backoffice, and submit a test request on the landing page.
5. Watch the logs for the next hourly reminder run.

Installed PWAs pick up the new frontend on their own: nginx serves `sw.js` and `manifest.webmanifest` with `no-cache`, the apps check for a new version every hour, and users see an update card. They are never forced to reload mid-task.

**Rollback:** redeploy the previous image. If the release included a migration, restore the backup or write a forward-fix migration. Prisma does not generate down-migrations.

---

## 6. Scaling

- **The API is stateless** (JWT, no server sessions), so you can run several replicas behind a load balancer.
- **Jobs are not replica-safe:** the cron scheduler runs inside each API process. With N replicas and jobs enabled everywhere, reminders would be evaluated N times at once and could be sent twice. Either:
  - set `JOBS_ENABLED=true` on a single instance and `false` on the rest; or
  - run a dedicated "worker" container from the same image with `JOBS_ENABLED=true` (optionally not exposing HTTP), and `false` on the API replicas; or
  - add a distributed lock (for example `pg_advisory_lock`) around `runReminderJob` before enabling jobs everywhere.
- **Uploads on local disk** do not work across replicas. Move `storageService` to S3/GCS first; it is the only file that touches the disk.
- **Heavy endpoints:**
  - `GET /customers` with `risk=...`, `sortBy=risk` or `sortBy=outstanding` computes risk scores and balances in memory for every matching customer.
  - `GET /dashboard/summary` loads all unpaid receivables and every customer's receivables (for the risk distribution).
  - `GET /admin/overview` and `GET /admin/tenants?sortBy=outstanding` aggregate across all tenants.

  All are fine for SMB tenants (thousands of rows) and a moderate number of tenants. For very large tenants or many tenants, precompute or cache them.

- **PDF generation** runs synchronously in the request (a few ms per statement). Move it to a queue only if statements become very large.
- **Frontends** are static files behind nginx; scale them freely or serve them from a CDN (keep `sw.js` and `manifest.webmanifest` uncached).

---

## 7. Monitoring and logs

**Where logs go:** everything is written to stdout/stderr, so view it with `docker compose logs -f backend` or your platform's log viewer.

- `lib/logger.ts` prints `[ISO timestamp] LEVEL message`. `debug` lines are hidden when `NODE_ENV=production`.
- `morgan` logs each HTTP request (`dev` format locally, Apache `combined` in production).

**Log lines worth alerting on**

| Pattern                                                                | Meaning                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ERROR Unhandled error on <METHOD> <URL>`                              | A 500 response; the stack trace follows                                                                                                                      |
| `[reminders] ... N failed` with N > 0                                  | Messages the provider rejected (check phone numbers and credentials)                                                                                         |
| `[reminders] Failed for tenant` / `[monthly-report] Failed for tenant` | A job crashed for one tenant; the others continued                                                                                                           |
| `Automatic statement dispatch failed`                                  | The statement after a payment could not be generated or sent                                                                                                 |
| `WhatsApp provider "<name>" threw an error`                            | The provider adapter broke its "never throw" contract; fix the adapter                                                                                       |
| Missing `[reminders] ... processed` for more than 1 hour               | The scheduler is not running (`JOBS_ENABLED`, crashed process, or no instance has jobs enabled)                                                              |
| Many `401` on `/api/admin/auth/login`                                  | Someone is guessing backoffice passwords (login endpoints are not rate-limited yet)                                                                          |
| Many `429` on `/api/public/access-requests`                            | Someone is flooding the landing form; the limiter (5 per hour per IP) is holding. If it hits real users behind one NAT, consider a shared store or a CAPTCHA |
| Many `403 PASSWORD_CHANGE_REQUIRED`                                    | Normal right after onboarding; if it persists for one user, the web app is not reaching `/change-password` (check the frontend version)                      |

**Health check:** `GET /api/health` returns `200 { status: "ok", service, timestamp }`. Docker uses it, and it is suitable for uptime monitors. It does not check the database, so a DB outage shows up as 500s on real endpoints.

**Useful SQL checks**

```sql
-- Failed sends in the last 24 hours, per tenant
SELECT r."tenantId", count(*) FROM notifications n
JOIN receivables r ON r.id = n."receivableId"
WHERE n.status = 'failed' AND n."sentAt" > now() - interval '24 hours'
GROUP BY r."tenantId";

-- Receivables whose status should already be overdue (should return 0 after the hourly job;
-- suspended tenants are skipped by the job, so exclude them)
SELECT count(*) FROM receivables r JOIN tenants t ON t.id = r."tenantId"
WHERE t.status = 'active' AND r.status IN ('pending', 'partial') AND r."dueDate" < current_date;

-- Suspended tenants
SELECT id, name, plan FROM tenants WHERE status = 'suspended';
```

**Recommended upgrades:** switch `lib/logger.ts` to a structured JSON logger (for example pino) with request ids, ship the logs to an aggregator, and add error tracking (for example Sentry) in the API and the frontends.

---

## 8. Security hardening backlog

Current state and recommended next steps:

| Area                                  | Current                                                                                                                           | Recommendation                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh tokens                        | Stateless JWT (7 days); cannot be revoked individually                                                                            | Store hashed refresh tokens in a table with rotation and reuse detection, and revoke them on logout or password change                                        |
| Tenant suspension / user deactivation | Both block login and refresh (`TENANT_SUSPENDED`, `USER_DISABLED`); issued access tokens stay valid until expiry (15 min default) | Check `Tenant.status` / `User.active` in `authenticate` (cached), or revoke refresh tokens on suspension, deactivation and password reset                     |
| Token realms                          | Tenant and platform tokens share the JWT secrets and are separated by `type` + audience                                           | Consider dedicated secrets for platform tokens so a leak of one realm's secret doesn't affect the other                                                       |
| Token storage (web)                   | `localStorage` (`solvia.*` and `solvia.admin.*`)                                                                                  | Move refresh tokens to `HttpOnly`, `Secure`, `SameSite` cookies                                                                                               |
| Brute force                           | Only `POST /public/access-requests` is rate-limited (in memory, per process, 5/hour/IP)                                           | Rate-limit `/auth/login`, `/auth/google`, `/auth/change-password` and `/admin/auth/login` too, with a shared store (e.g. Redis) when running several replicas |
| Backoffice access                     | Password login only; one seeded admin                                                                                             | Network restriction, MFA or SSO for staff; an audit log of plan, status, tenant creation and user changes; admin management                                   |
| Temporary passwords                   | 12 random characters, bcrypt-hashed, shown once, shared by copy or WhatsApp; forced change at first sign-in; no expiry            | Add an expiry for unused temporary passwords, and deliver them by email with a one-time link instead of in chat                                               |
| Files                                 | Public under `/files` with unguessable UUID names                                                                                 | Object storage with short-lived signed URLs; authenticated download for proofs                                                                                |
| Secrets rotation                      | Changing a JWT secret logs everyone out (tenants and staff)                                                                       | Support two secrets during rotation (verify with old or new, sign with new)                                                                                   |
| Audit trail                           | Notifications only                                                                                                                | Add an audit log for payments, deletions, settings changes and backoffice actions (who, when, what)                                                           |
| Password policy                       | ≥ 8 characters with uppercase, number and special character (new passwords only); new password must differ from the current one   | Add a self-service password-reset flow (needs an email provider; today an admin resets it) and a breached-password check                                      |
| Google sign-in                        | Links an existing account by verified email automatically; unknown emails are rejected while self sign-up is off                  | Consider asking for the password (or an email confirmation) before linking                                                                                    |
| Headers                               | `helmet()` defaults on the API                                                                                                    | Add a CSP on the nginx side for the SPAs (allow `accounts.google.com` for Google Identity Services)                                                           |
| Tenant isolation                      | Central Prisma extension                                                                                                          | Add integration tests that assert cross-tenant access returns 404 for every endpoint                                                                          |

---

## 9. Troubleshooting

### Startup

| Symptom                                                                                   | Cause                                                                                             | Fix                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Invalid environment configuration:` followed by a list                                   | Missing or invalid env vars (zod check in `config/env.ts`)                                        | Fix the listed variables in `.env`; JWT secrets need at least 32 characters, `PLATFORM_ADMIN_EMAIL` must be an email and `PLATFORM_ADMIN_PASSWORD` at least 8 characters |
| Seed fails with a password validation error                                               | `PLATFORM_ADMIN_PASSWORD` doesn't meet the password policy (uppercase, number, special character) | Choose a compliant password                                                                                                                                              |
| `Can't reach database server` / `P1001`                                                   | PostgreSQL is down or `DATABASE_URL` is wrong                                                     | `docker compose up -d postgres`; check host, port and credentials (inside Docker the host is `postgres`, not `localhost`)                                                |
| `WhatsApp provider "meta" is not implemented yet`                                         | A provider without an adapter is selected                                                         | Use `mock`, or implement the adapter                                                                                                                                     |
| `EADDRINUSE :4000` / `:5173` / `:5174` / `:5175`                                          | A previous process is still running (common on Windows when a terminal is closed)                 | Windows: `Get-NetTCPConnection -LocalPort 4000 \| Select OwningProcess`, then `Stop-Process -Id <pid>`. macOS/Linux: `lsof -i :4000`, then `kill <pid>`                  |
| `The table "public.x" does not exist` / `column "status" does not exist`                  | Migrations not applied                                                                            | `npx prisma migrate deploy`                                                                                                                                              |
| TypeScript errors such as `Module '@prisma/client' has no exported member 'TenantStatus'` | The Prisma client wasn't generated after a schema change or install                               | `npx prisma generate`                                                                                                                                                    |

### Runtime

| Symptom                                                                       | Cause                                                                                                                                                      | Fix                                                                                                                                      |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Tenant context is required to query model "X"`                               | The scoped `prisma` client was used outside a request or job context                                                                                       | Wrap the work in `runWithTenant(tenantId, fn)`; use `basePrisma` only for deliberately cross-tenant work                                 |
| An endpoint returns `404` for a record that exists                            | The record belongs to another tenant (correct behavior), or the id is wrong                                                                                | Check you are logged in to the right tenant                                                                                              |
| After adding a library callback or stream, queries fail with the tenant error | The callback runs outside the async context                                                                                                                | Wrap the continuation with `AsyncResource.bind(...)` (see `middleware/upload.ts`)                                                        |
| Rows from other tenants are visible                                           | The model is not registered in `DIRECT_TENANT_MODELS` / `RECEIVABLE_SCOPED_MODELS`, or `basePrisma` was used                                               | Register the model and replace the `basePrisma` usage; treat this as a security incident                                                 |
| `401` with a valid-looking token                                              | A platform token was sent to a tenant route, or a tenant token to `/api/admin/*` (by design), or the token expired                                         | Use the token from the right login (`/auth/login` vs `/admin/auth/login`)                                                                |
| `403 TENANT_SUSPENDED` on login or refresh                                    | The business was suspended in the backoffice                                                                                                               | Reactivate it in the backoffice (business detail) or `PATCH /api/admin/tenants/:id` with `{ "status": "active" }`                        |
| A suspended business gets no reminders or reports                             | By design: jobs only process active tenants                                                                                                                | Reactivate it                                                                                                                            |
| `409 EMAIL_TAKEN` on register, create user or "Nueva empresa"                 | The email is already used by any user of any business (emails are globally unique)                                                                         | Use another email                                                                                                                        |
| `403 SIGNUP_DISABLED` on `POST /auth/register`                                | Self sign-up is off (`SELF_SIGNUP_ENABLED=false`, the default)                                                                                             | Onboard the business from the backoffice, or set `SELF_SIGNUP_ENABLED=true` and restart                                                  |
| `403 GOOGLE_ACCOUNT_NOT_FOUND`                                                | Google sign-in with an email that has no Solvia user, while self sign-up is off                                                                            | Create the user first (backoffice or Settings → Users), then sign in with Google using the same email                                    |
| `403 USER_DISABLED` on login or refresh                                       | The user was deactivated by their business admin or in the backoffice                                                                                      | Reactivate them in Settings → Users or the business detail in the backoffice                                                             |
| `403 PASSWORD_CHANGE_REQUIRED` on every request                               | The user still has a temporary password (token claim `pwc`)                                                                                                | Change it via `/change-password` in the web app (`POST /api/auth/change-password`)                                                       |
| `400 LAST_ADMIN` / `400 CANNOT_MODIFY_SELF`                                   | The change would leave the business without an active admin, or the user tried to change their own role, deactivate themselves or reset their own password | Promote another user to admin first; use change-password for your own password                                                           |
| `400 ACCESS_REQUEST_CONVERTED`                                                | The access request was already converted into a business                                                                                                   | Open the business from the request's menu instead                                                                                        |
| `429 TOO_MANY_REQUESTS` on the landing form                                   | More than 5 requests in an hour from the same IP (the counter is in memory, so restarting the API resets it)                                               | Wait (see `Retry-After`). Behind a proxy that doesn't forward `X-Forwarded-For`, every visitor shares one IP: fix the proxy headers      |
| A temporary password was lost                                                 | It is only shown once                                                                                                                                      | Reset it again (Settings → Users or the backoffice business detail); the old one stops working                                           |
| `401 INVALID_CREDENTIALS` for an account that signs in with Google            | Google-only accounts have no password                                                                                                                      | Use "Continue with Google"                                                                                                               |
| `503 GOOGLE_NOT_CONFIGURED`                                                   | `GOOGLE_CLIENT_ID` is not set on the backend                                                                                                               | Set it and restart; without it the button is shown disabled with an "unavailable" note                                                   |
| `401 GOOGLE_TOKEN_INVALID`                                                    | The ID token was issued for another client ID, or it expired                                                                                               | Make sure the web app and the backend use the same OAuth client and the origin is authorized                                             |
| `422 PAYMENT_EXCEEDS_BALANCE`                                                 | The amount is higher than the balance, or a concurrent payment was registered                                                                              | Refresh the page and use the current balance                                                                                             |
| A PDF or proof link opens but returns 404                                     | `STORAGE_DIR` changed or the volume was recreated                                                                                                          | Restore the storage backup; statements can be regenerated                                                                                |
| Statement links in WhatsApp point to `localhost`                              | `PUBLIC_API_URL` is not set to the public URL                                                                                                              | Set it and restart                                                                                                                       |
| Swagger UI shows no endpoints                                                 | Missing `@openapi` blocks, or the glob in `config/swagger.ts` doesn't match                                                                                | The glob must use forward slashes (already handled for Windows) and cover `routes/*.ts` (dev) and `*.js` (build). Check `/api/docs.json` |
| Changes are not reflected in the API                                          | An old process is still serving on the port                                                                                                                | See `EADDRINUSE` above; make sure only one API process is running                                                                        |

### Reminders and reports

| Symptom                                       | Checks                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No reminders are sent                         | 1) `JOBS_ENABLED=true` and the log shows `[scheduler] "reminders" scheduled`; 2) the tenant is active (not suspended); 3) the tenant's rules are enabled (Settings); 4) the receivable is unpaid and inside a window; 5) a reminder of that type wasn't already sent in the current window (see the send log); 6) the provider isn't returning failures (`status = failed` rows) |
| A reminder was sent twice                     | More than one instance has jobs enabled (see [§6](#6-scaling)), or the due date was changed (which re-arms the reminder by design)                                                                                                                                                                                                                                               |
| All sends fail with `Invalid WhatsApp number` | The customer phone isn't E.164 (`+<country><number>`). The validator normalizes new input, but check imported data                                                                                                                                                                                                                                                               |
| Monthly report missing                        | It is generated only on the **last day of the month** (in `APP_TIMEZONE`) by the daily `MONTHLY_REPORT_CRON` run, and only for active tenants. Generate it manually with `POST /api/reports/monthly/generate` and `{ "period": "YYYY-MM" }`                                                                                                                                      |
| Due dates look off by one day                 | The server timezone was used instead of `APP_TIMEZONE`. Always use `todayInTimezone(env.APP_TIMEZONE)` and date-only values                                                                                                                                                                                                                                                      |

### Frontend

| Symptom                                                                                              | Cause                                                                                                                                         | Fix                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logged out right after login                                                                         | The refresh token is invalid, the JWT secrets changed, or the business was suspended                                                          | Log in again; after rotating secrets this is expected                                                                                              |
| `Could not reach the server` (`NETWORK_ERROR`)                                                       | The API is down or the proxy target is wrong                                                                                                  | Check `VITE_PROXY_TARGET` (dev) or the container's `API_UPSTREAM` (Docker; origin only, no `/api` path)                                            |
| The landing form always fails                                                                        | The landing container can't reach `API_UPSTREAM`, or the API isn't running                                                                    | Start the API (the landing works without it, except for the form) and check `API_UPSTREAM`                                                         |
| An error shows in English in the Spanish UI                                                          | The error code is missing from `errors.codes` in that frontend's `src/ui/i18n/messages.ts`                                                    | Add it to both `uiEs` and `uiEn`, in every frontend that can receive it ([recipe](DEVELOPMENT_GUIDE.md#add-a-new-api-error-code))                  |
| `Cannot find module '@/ui'`                                                                          | The `@` alias is missing from `vite.config.ts` (`resolve.alias`) or `tsconfig.app.json` (`paths`)                                             | Restore both (`@` → `./src`)                                                                                                                       |
| A kit component behaves differently in two frontends                                                 | The copies of `src/ui` have drifted                                                                                                           | Compare them with `diff -rq solvia-app/src/ui solvia-admin/src/ui` and port the change ([checklist](DEVELOPMENT_GUIDE.md#change-the-ui-kit-srcui)) |
| A menu or the phone country picker opens behind a modal, or in the wrong place                       | An old copy of `Overlays.tsx` / `styles.css` (popovers must render inside the open `<dialog>`, and modal entrances must use `backwards` fill) | Copy the current `Overlays.tsx` and the modal animation rules from `solvia-app`                                                                    |
| Kit classes have no styles                                                                           | `src/index.css` is missing `@import './ui/styles.css';`                                                                                       | Restore it (`@import 'tailwindcss'; @import './ui/styles.css';`)                                                                                   |
| Light/dark flash on load                                                                             | The theme pre-paint script is missing from the app's `index.html`                                                                             | Copy it from another app                                                                                                                           |
| The Google button is disabled ("unavailable") or doesn't render                                      | `GET /api/auth/config` returns `googleClientId: null`, or the Google script is blocked (CSP, ad blocker)                                      | Set `GOOGLE_CLIENT_ID` on the backend; check the browser console                                                                                   |
| Google popup error "origin not allowed"                                                              | The page origin isn't in the OAuth client's _Authorized JavaScript origins_                                                                   | Add `http://localhost:5173`, `http://localhost:8080` or your production URL                                                                        |
| The landing's buttons open the wrong URL                                                             | `VITE_APP_URL` is inlined at build time                                                                                                       | Set it (in `.env` or as a Docker build arg) and rebuild                                                                                            |
| No install option in development                                                                     | The browser needs a secure context and a valid manifest; the dev service worker (`devOptions.enabled`) lives in `dev-dist/`                   | Use `localhost`, check DevTools → Application; for the update card use `npm run build && npm run preview` or the Docker image                      |
| Stale behavior in dev after switching branches                                                       | The dev service worker keeps serving old files                                                                                                | Unregister it in DevTools → Application → Service workers, or delete `dev-dist/` and restart `npm run dev`                                         |
| Users keep seeing an old version                                                                     | An installed PWA serves the cached build until the user accepts the update                                                                    | Make sure nginx serves `sw.js` with `no-cache`; the user accepts the update card (or reloads after closing all tabs)                               |
| A chart inside a grid or flex layout grows forever or the page stalls                                | Recharts `ResponsiveContainer` in a child without `min-width: 0`                                                                              | Add `min-w-0` to the grid or flex child and give the chart wrapper a fixed height (see `solvia-app/src/components/charts/CashFlowChart.tsx`)       |
| A new `VITE_*` variable has no effect in Docker                                                      | Vite inlines env vars at build time, and `.dockerignore` excludes `.env`                                                                      | Declare it as a build `ARG` (and `ENV`) in that frontend's `Dockerfile`, pass it from `docker-compose.full.yml`, and rebuild                       |
| `docker compose -f docker-compose.yml -f docker-compose.full.yml` fails with a missing build context | The frontends are not cloned next to `solvia-backend`                                                                                         | Clone them side by side, or set `SOLVIA_REPOS_DIR` to the folder that contains them                                                                |
| Data is stale after an action                                                                        | The mutation doesn't invalidate the right query keys                                                                                          | Use `useInvalidateCollections()`, or invalidate the specific `queryKeys.*` entry                                                                   |
| `en.ts` fails to compile after adding a key                                                          | `en.ts` must have exactly the shape of `es.ts`                                                                                                | Add the missing key (or remove the extra one)                                                                                                      |

### Tooling

| Symptom                                                                        | Fix                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI fails on `format:check`                                                     | Files weren't formatted                                                                                                                                                  | Run `npm run format` in that repository and commit |
| `npm ci` fails in CI                                                           | `package-lock.json` is out of sync with `package.json`                                                                                                                   | Run `npm install` locally and commit the lockfile  |
| `npm install` fails with `Cannot read properties of null (reading 'edgesOut')` | A known npm 10 resolver bug, seen when upgrading to Vitest 4. Revert the upgrade, delete `node_modules`, run `npm install` again, or retry with a newer npm              |
| `prisma migrate dev` fails or hangs in an automated or AI session              | It needs an interactive terminal. Use `prisma migrate diff ... --output .../migration.sql` + `prisma migrate deploy` ([recipe](DEVELOPMENT_GUIDE.md#create-a-migration)) |
| Prisma refuses `migrate reset` in an automated or AI session                   | This is Prisma's safety guard for destructive commands; run it yourself in a terminal, and only against a development database                                           |
| ESLint `react-refresh/only-export-components` warning                          | Move non-component exports (helpers, constants) to a `lib/` file                                                                                                         |

---

## 10. Repositories

Solvia is published as four independent GitHub repositories:

| Repository       | Contents                                                                                                                                                                     | Deploys as                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `solvia-backend` | The API (Express + Prisma), migrations, seed, unit tests, **these docs**, `docker-compose.yml` (postgres + backend) and `docker-compose.full.yml` (adds the three frontends) | The backend image (`Dockerfile`)                        |
| `solvia-app`     | Business web app (PWA), with its own `src/ui` kit copy                                                                                                                       | nginx image, `API_UPSTREAM` → API                       |
| `solvia-admin`   | Platform backoffice (PWA), with its own `src/ui` kit copy                                                                                                                    | nginx image, `API_UPSTREAM` → API                       |
| `solvia-landing` | Public landing page, with a subset of the kit                                                                                                                                | nginx image, `API_UPSTREAM` → API (access request form) |

How they relate:

- **At runtime only, over HTTP.** The frontends call the API through their own `/api` proxy (Vite in development, nginx in Docker). They link to each other with build-time URLs: `VITE_LANDING_URL` in the app, `VITE_APP_URL` in the landing and the backoffice.
- **No shared code.** The UI kit is copied into each frontend's `src/ui`. A kit change is a change in every repository that needs it ([checklist](DEVELOPMENT_GUIDE.md#change-the-ui-kit-srcui)).
- **The API contract** is defined in `solvia-backend` (`/api/docs`). Error codes must be translated in each frontend that can receive them. Deploy the backend first when a change adds endpoints or codes, and keep the API backward compatible until the frontends are updated.
- **CI per repository:** `.github/workflows/ci.yml`. Each repository versions and releases on its own; there is no cross-repository release.
- **Local layout:** clone the four repositories side by side. `docker-compose.full.yml` builds the frontends from `${SOLVIA_REPOS_DIR:-..}/solvia-app` (and `solvia-admin`, `solvia-landing`), so set `SOLVIA_REPOS_DIR` if they live elsewhere. Run it with `docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build` from `solvia-backend`.
- **Documentation:** system-wide docs live here, in `solvia-backend/docs`. Each frontend's README covers only that repository.
