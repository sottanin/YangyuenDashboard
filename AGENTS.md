# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js App Router dashboard backed by Prisma and PostgreSQL. Application code lives in `src/`. Pages and route handlers are under `src/app`, with dashboard screens in `src/app/dashboard` and API endpoints in `src/app/api`. Shared UI primitives live in `src/components/ui`, layout components in `src/components/layout`, charts in `src/components/charts`, and server utilities in `src/lib`. Database schema, migrations, and seed logic are in `prisma/`. Static assets belong in `public/`.

## Build, Test, and Development Commands

- `npm run dev`: start the local Next.js development server.
- `npm run build`: create a production build and run Next.js compile checks.
- `npm run start`: serve the production build locally.
- `npm run lint`: run ESLint using Next.js core web vitals and TypeScript rules.
- `npx prisma migrate dev`: apply local schema migrations during development.
- `npx prisma db seed`: run `prisma/seed.ts`.

Use `docker-compose.yml` when local PostgreSQL or containerized app services are needed.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Follow the existing two-space indentation and double-quote import style. Components use `PascalCase` filenames, hooks and helpers use `camelCase`, and App Router folders use route-oriented lowercase names. Keep reusable UI in `src/components`, data access and server helpers in `src/lib`, and route-specific logic close to the page or API route that owns it.

## Testing Guidelines

No automated test framework is currently configured. Before handing off changes, run `npm run lint` and `npm run build`. For database changes, add a Prisma migration and verify it applies against a local database. If adding tests later, prefer colocated `*.test.ts` or `*.test.tsx` files and document the new test command in `package.json`.

## Commit & Pull Request Guidelines

Git history currently only shows the initial Create Next App commit, so there is no established commit convention. Use short, imperative commit messages such as `Add wallet balance chart` or `Fix batch log status filter`. Pull requests should include a brief summary, verification steps, linked issue or requirement when available, screenshots for dashboard UI changes, and notes for schema or environment changes.

## Security & Configuration Tips

Never commit real secrets, database URLs, API tokens, exported spreadsheets with sensitive data, or local environment files. Keep configuration in environment variables and document required keys with placeholder values only. Review Prisma migrations carefully because they affect persisted dashboard data.
