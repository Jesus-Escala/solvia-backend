# Solvia documentation

These docs live in the `solvia-backend` repository and cover the whole system: the API and the three frontend repositories.

**Path convention:** a path without a repository prefix is relative to the root of `solvia-backend` (e.g. `src/services/auth.service.ts`). Paths in a frontend are prefixed with the repository name (e.g. `solvia-app/src/pages/AuthPages.tsx`).

| Document                                     | Read it when you want to...                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [../README.md](../README.md)                 | Install and run Solvia (Docker or local), check environment variables, demo accounts, the API overview and scripts                                                                                                                                                                                                                                                                                                                 |
| [ARCHITECTURE.md](ARCHITECTURE.md)           | Understand **how everything works**: layers, the request lifecycle, multi-tenancy, authentication (incl. Google sign-in) and **managed onboarding** (access requests, temporary passwords, the forced password change, team management). It also covers the platform backoffice, the data model, business rules, flows, jobs, providers, error codes, the three frontends and their UI kit copies, the PWA and the Docker topology |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | **Write code anywhere** in the system: conventions, a "where do I change X?" map and step-by-step recipes. Backend recipes cover migrations, a new field, endpoint, backoffice endpoint, error code, model, provider and job. Frontend recipes cover a page, form, translations, a UI kit change across repositories, a new frontend and PWA icons. It ends with testing and CI                                                    |
| [MAINTENANCE.md](MAINTENANCE.md)             | **Keep it running**: migrations, backups, dependency upgrades (four repositories), production deploys, scaling, the security backlog, troubleshooting, and how the repositories relate                                                                                                                                                                                                                                             |

Each frontend repository has its own README with its setup, environment variables, scripts, structure and Docker image.

## The system at a glance

| Part                   | Repository                     | Local URL                                       | Docker URL (`docker-compose.full.yml`) |
| ---------------------- | ------------------------------ | ----------------------------------------------- | -------------------------------------- |
| API (Express + Prisma) | `solvia-backend`               | http://localhost:4000/api (docs at `/api/docs`) | http://localhost:4000/api              |
| Business web app       | `solvia-app`                   | http://localhost:5173                           | http://localhost:8080                  |
| Landing page           | `solvia-landing`               | http://localhost:5174                           | http://localhost:8081                  |
| Platform backoffice    | `solvia-admin`                 | http://localhost:5175                           | http://localhost:8082                  |
| PostgreSQL             | – (image `postgres:16-alpine`) | `localhost:5432`                                | `localhost:5432`                       |

There is no shared UI package: each frontend has its own copy of the UI kit in `src/ui` (the landing's is a subset). See [ARCHITECTURE.md §14](ARCHITECTURE.md#14-frontend-architecture).

Demo accounts (password `Password123!`): business admin `admin@bodegasanmartin.pe`, collector `collector@bodegasanmartin.pe` and platform admin `admin@solvia.app`. The seed also creates three pending access requests and one dismissed request. More in the [root README](../README.md#demo-accounts).

## New to the codebase?

Suggested order:

1. Clone the four repositories side by side, run everything (root README), and sign in to the web app and the backoffice with the demo accounts.
2. Walk through managed onboarding once:
   1. Landing → "Solicitar acceso".
   2. Backoffice → Solicitudes → convert.
   3. Web app → sign in with the temporary password → set a new one.
   4. Settings → Users → add a collector.
3. Read ARCHITECTURE.md sections 2–6, then section 14 for the frontends.
4. Do the "Add a new endpoint" recipe from the development guide on a branch, then "Add or change translations" to show its data in the UI.
