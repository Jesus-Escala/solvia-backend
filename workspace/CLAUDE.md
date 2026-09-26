# Solvia workspace

> Copy this file to the folder that contains the four repositories (`cp solvia-backend/workspace/CLAUDE.md ../CLAUDE.md` from this repo) so that tools like Claude Code opened there see the whole system.

**Start of every session:** read `SOLVIA-CONTEXTO.pdf` in this folder (the whole project in one
document: test accounts first, how to run everything, modules, features, conventions, how the user
works, decisions, pending list). Its editable source is `SOLVIA-CONTEXTO.fuente.html`: at the end of
a working day update that file and regenerate the PDF (command at its end) instead of writing a
session log.

This folder is NOT a repository. It holds the four independent Solvia repositories, cloned side
by side. Each one has its own git history, its own `CLAUDE.md` with the details, and its own
GitHub repository (`github.com/Jesus-Escala/<name>`). Always `cd` into the right repository
before running git or npm commands, and commit/push each repository separately.

| Folder            | What it is                                                                                                           | Dev URL                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `solvia-backend/` | API (Express + Prisma + PostgreSQL), jobs, database migrations/seed, Docker Compose, **full system docs** in `docs/` | http://localhost:4000 (Swagger: `/api/docs`) |
| `solvia-app/`     | Web app for businesses (dashboard, customers, receivables, payments, team)                                           | http://localhost:5173                        |
| `solvia-admin/`   | Platform backoffice (businesses, users, access requests)                                                             | http://localhost:5175                        |
| `solvia-landing/` | Public landing page with the "Solicitar acceso" form                                                                 | http://localhost:5174                        |

## How the projects talk to each other

```
solvia-landing ──POST /api/public/access-requests──┐
solvia-app ─────/api/auth, /customers, /receivables,├──► solvia-backend ──► PostgreSQL
               /dashboard, /settings, /users ...   │      (:4000)          (:5432)
solvia-admin ───/api/admin/* (platform tokens) ────┘
```

- The backend is the only one with a database. The frontends never talk to each other through
  code: only through the API and plain links (landing → app login, app login → landing
  `#solicitar-acceso`, admin → app).
- In development each frontend's Vite server proxies `/api` (and `/files`) to
  `VITE_PROXY_TARGET` (default `http://localhost:4000`). In Docker, nginx proxies `/api` to
  `API_UPSTREAM`.
- The app and the admin use **different sessions**: tenant tokens (`/api/auth/*`) vs platform
  tokens (`/api/admin/auth/*`). They are not interchangeable.

## Run everything locally (no Docker needed)

Open five terminals:

1. `cd solvia-backend && npm run db:local` — PostgreSQL on :5432 (data in `solvia-backend/.local-db/`)
2. `cd solvia-backend && npm run dev` — API on :4000
3. `cd solvia-app && npm run dev`
4. `cd solvia-admin && npm run dev`
5. `cd solvia-landing && npm run dev`

First time on a new machine: in every repo `cp .env.example .env && npm install`; in the backend
also `npm run db:deploy && npm run db:seed` after starting `db:local`.

With Docker instead: from `solvia-backend`,
`docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build`.

Test accounts: see the first page of `SOLVIA-CONTEXTO.pdf` (the seed's demo accounts —
`admin@bodegasanmartin.pe`, `collector@bodegasanmartin.pe` — only exist after `npm run db:seed`;
platform admin `admin@solvia.app`).

## Changes that span several repositories

- **API contract change** (new/changed endpoint, field or response shape): change the backend
  first (validator, route with OpenAPI JSDoc, service, tests), then update the TypeScript types
  and hooks of every frontend that calls it (`src/lib/types.ts`, `src/hooks/queries.ts` or
  `src/lib/api.ts`). Keep backend changes backwards compatible when possible, because the four
  repositories are deployed independently.
- **New API error code** (`new AppError(status, 'CODE', message)`): add its Spanish and English
  text under `errors.codes` in `src/ui/i18n/messages.ts` of each frontend that can receive it.
- **UI kit** (`src/ui/`) is copied into each frontend, not shared. A fix to a kit component must
  be applied to every repo that has that file (`diff -rq solvia-app/src/ui solvia-admin/src/ui`
  shows drift). The landing has a smaller subset.
- **Password policy** lives in `solvia-backend/src/validators/auth.schemas.ts` and is mirrored in
  `src/ui/components/passwordRules.ts` of app and admin.
- **Module prices and plan allowances** live in `solvia-backend/src/domain/plans.ts` (served to the
  admin by `GET /admin/pricing`) and are mirrored in `solvia-landing/src/sections/plans.ts`
  (`PRICED_MODULES`, `ALLOWANCES`) and `solvia-app/src/components/modules/ModulesOffer.tsx`.
- **Brand/mascot** geometry (`src/ui/brand/owlGeometry.ts`) is mirrored in each frontend and in
  the PDF statement of the backend (`src/services/statement.service.ts`).

## Conventions (all repositories)

- Code, identifiers, comments, commit messages and docs in **English**; UI text in Spanish by
  default with English translations (i18n dictionaries, never hardcoded strings).
- TypeScript strict, ESLint + Prettier (LF line endings). Before committing in a repo run its
  lint, typecheck/build and tests (see that repo's `CLAUDE.md`); GitHub Actions runs the same.
- Conventional commits (`feat(api): ...`, `fix(web): ...`, `docs: ...`).
- Never commit `.env` files, `node_modules`, builds, `storage/` or `.local-db/`.
