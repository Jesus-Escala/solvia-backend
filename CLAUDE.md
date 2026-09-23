# solvia-backend

Solvia API: multi-tenant credit management and collections for small businesses (Peru, PEN).
Express 5 + TypeScript + Prisma 6 (pinned 6.19.3) + PostgreSQL, zod 4 validation, JWT access +
refresh tokens, node-cron jobs, Swagger. This repository also holds the **documentation of the
whole system** (`docs/`) and the Docker Compose files.

Sibling repositories (cloned next to this one, see `../CLAUDE.md` if present):
`solvia-app` (business web app), `solvia-admin` (platform backoffice), `solvia-landing` (public
page). They only reach this project through HTTP under `/api`.

## Commands

```bash
npm run db:local     # local PostgreSQL 17 on :5432, data in .local-db/ (no Docker needed)
npm run dev          # API with hot reload on :4000 (Swagger UI at /api/docs)
npm run db:deploy    # apply migrations      npm run db:seed  # demo data (--force to reset)
npm run lint         # ESLint                npm run format   # Prettier
npm run typecheck    # tsc --noEmit          npm test         # Vitest (unit, no DB needed)
npm run build        # compile to dist/      npm start        # run the build
```

Full platform with Docker: `docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build`
(`docker-compose.yml` alone = API + PostgreSQL). CI (`.github/workflows/ci.yml`): npm ci, prisma
generate, lint, format:check, typecheck, test, build.

## Architecture

Layers — keep them: `src/routes` (Express routers + OpenAPI JSDoc) → `src/controllers` (parse with
zod, call a service) → `src/services` (business rules) → `src/repositories` (Prisma queries).
Pure logic without I/O goes in `src/domain/*` and gets unit tests in `tests/`.

- `src/validators/*.schemas.ts` — zod schemas (request contracts). `src/services/dto.ts` — response shapes.
- `src/errors/AppError.ts` — throw `new AppError(status, 'CODE', 'English message')`; the error
  middleware returns `{ error: { code, message, details } }`. **Codes are a contract**: the
  frontends translate them (`errors.codes.*` in their `src/ui/i18n/messages.ts`).
- `src/lib/prisma.ts` — **tenant isolation**: the default Prisma client is extended to scope every
  query by the `tenantId` from `src/lib/tenantContext.ts` (AsyncLocalStorage) and fails closed
  without it. Use `basePrisma` ONLY for deliberate cross-tenant work (auth lookups, platform
  admin, jobs, public access requests). Jobs run per tenant via `src/jobs/tenantJobRunner.ts`.
- Auth realms (`src/services/token.service.ts`, `src/middleware/authenticate.ts`):
  - tenant tokens → `authenticate` + `tenantScope` (app); `pwc` claim blocks everything except
    `/auth/me` and `/auth/change-password` until a temporary password is changed;
  - platform tokens (`aud: solvia-platform`) → `authenticatePlatformAdmin` (backoffice).
    Never let one realm's token pass the other's middleware.
- Providers behind interfaces: `src/providers/whatsapp` and `src/providers/payment` (only `mock`
  implemented). Files (proofs, PDF statements) in `STORAGE_DIR` served under `/files`.

## API map (who uses what)

| Prefix                                                                                                                                               | Auth            | Used by        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------- |
| `/api/auth/*` (login, refresh, google, config, me, change-password; register only if `SELF_SIGNUP_ENABLED`)                                          | public / tenant | solvia-app     |
| `/api/customers`, `/api/receivables`, `/api/dashboard/*`, `/api/notifications`, `/api/reports/monthly`, `/api/settings/*`, `/api/users` (admin role) | tenant          | solvia-app     |
| `/api/admin/*` (auth, overview, tenants, tenant users, access-requests)                                                                              | platform        | solvia-admin   |
| `/api/public/access-requests` (honeypot + 5/hour/IP)                                                                                                 | public          | solvia-landing |

Onboarding is managed: businesses are created from the backoffice (or from an access request),
new users get a temporary password (`src/domain/temporaryPassword.ts`) and must change it.

## Database

- Schema: `prisma/schema.prisma`; migrations in `prisma/migrations/`. Money is `Decimal`; risk is
  computed, never stored.
- New migration: edit the schema, then `npx prisma migrate dev --name <name>` in an interactive
  terminal. In non-interactive shells (agents/CI) use
  `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql`
  then `npm run db:deploy` and `npx prisma generate`. Never edit an applied migration.
- On Windows `prisma generate` fails with EPERM while `npm run dev` is running (it locks the
  engine DLL): stop the dev server first.
- Seed: `src/database/seed.ts` (idempotent platform admin; `--force` wipes demo data).

## Adding an endpoint (checklist)

1. zod schema in `src/validators`.
2. Repository and service (plus a pure domain function with its unit test when there is logic).
3. Controller.
4. Route with OpenAPI JSDoc.
5. Stable error codes (`AppError`).
6. `npm run lint && npm run typecheck && npm test`.
7. Update `docs/` (API and error tables in ARCHITECTURE) and, in the consuming frontend repos,
   their types, hooks and the texts of new error codes.

## Conventions

English code/comments/commits; Spanish only in user-facing data (seed, WhatsApp templates).
Keep responses backwards compatible — the frontends deploy independently. Secrets only in `.env`
(see `.env.example`); never commit `.env`, `storage/` or `.local-db/`.
