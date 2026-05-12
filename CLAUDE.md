# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server (http://localhost:3000 or 3001)
npm run build        # Production build + TypeScript check
npm run lint         # ESLint via next lint

# Database
docker compose up -d                      # Start PostgreSQL on port 5433
npx prisma migrate dev --name <name>      # Create and apply a migration
npx prisma db push                        # Push schema changes without migration history
npx prisma generate                       # Regenerate Prisma Client after schema changes
npx prisma db seed                        # Run prisma/seed.ts via tsx (imports Excel data)
npx prisma studio                         # Open database GUI
```

`.env` must contain:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/yangyuen?schema=public"
```
Note: Docker maps container port 5432 → host port **5433**.

## Architecture

### Stack
- **Next.js 16 App Router** — React 19, TypeScript strict, Server Components by default
- **Prisma 7 + PostgreSQL** — uses `@prisma/adapter-pg` (native driver); all DB access via `src/lib/prisma.ts` singleton
- **Tailwind CSS v4** — no `tailwind.config.ts`; PostCSS only. Real theming is done via CSS custom properties in `globals.css`, not Tailwind color utilities
- **Pure SVG charts** — no Recharts; all chart components in `src/components/charts/` are hand-rolled SVG with `'use client'`
- **xlsx** — used only in `prisma/seed.ts` to import `Transactions.xlsx` and `Redemption Transactions.xlsx`

### Theme System
`ThemeProvider` (`src/components/ThemeProvider.tsx`) is a client component that:
- Reads/writes `localStorage('nx-theme')` (`light` | `dark` | `system`)
- Toggles `.dark` class on `<html>` — all CSS vars respond to this class
- Listens to `prefers-color-scheme` media query when mode is `system`

**CSS custom properties** in `globals.css` follow this pattern: `--accent: 99 102 241` (space-separated RGB). Usage in CSS: `rgb(var(--accent))`. In SVG (which can't resolve CSS vars natively), use `resolveColor()` from `src/components/charts/chartUtils.ts`.

### Chart Color Resolution
SVG `fill`/`stroke` cannot resolve `var(--accent)` natively. Use the utilities in `src/components/charts/`:
- `resolveColor(c)` — converts `var(--accent)` or `rgb(var(--accent))` → `rgb(99 102 241)` via `getComputedStyle`
- `useResolvedColors(colors[])` — React hook; re-resolves on `.dark` class change via `MutationObserver`
- `smoothPath(points)` — Catmull-Rom spline for smooth SVG paths
- `fmt(n)` — number formatter: `1_234_567 → "1.2M"`

### Dashboard Shell
`dashboard/layout.tsx` composes: `ThemeProvider` → `DashboardShell` (client) → page children.

`DashboardShell` manages:
- Sidebar state (`open` 240px / `narrow` 68px / `closed` 0px) — persisted in `localStorage('nx-sidebar')`
- Layout shift via `marginLeft` CSS transition
- Background layers: `.grid-bg` and `.ambient-bg` (fixed, pointer-events none)

### Sidebar Navigation
```
Workspace: Overview (/dashboard), Analytics, Reports
Blockchain: Transactions, Tokens, Wallets
System: Settings
```

### Data Models (6 Prisma models)
| Model | Content |
|---|---|
| `Transaction` | ERC-20 token transfers/mints from `Transactions.xlsx` (11,603 rows) |
| `RedemptionTransaction` | ERC-721 burns/transfers from `Redemption Transactions.xlsx` (249 rows) |
| `NFTInstance` | NFT metadata — food item names, IPFS images, owner (134 rows) |
| `Wallet` | 5-token balances: `balanceICC`, `balanceGreen`, `balanceTogether`, `balanceIntegrity`, `balanceFit` (348 rows) |
| `TokenContract` | ERC-20 token name → contract address (5 tokens) |
| `AddressContract` | Named contract addresses (Loyalty Marketplace, fee wallets, etc.) |

### API Routes
All routes are in `src/app/api/` and return JSON. Parallel Prisma queries use `Promise.all`.
- `GET /api/stats` — aggregate KPIs
- `GET /api/transactions?page=&limit=&token=&type=` — paginated TX list
- `GET /api/wallets?page=&limit=` — paginated wallet list
- `GET /api/tokens` — token contract summary + NFT count
- `GET /api/charts/volume` — monthly TX volume series
- `GET /api/charts/heatmap` — 7×24 TX count grid (day × hour)

### Prisma Client
`src/lib/prisma.ts` uses the `PrismaPg` driver adapter (required for Prisma 7). The singleton pattern prevents connection pool exhaustion during hot-reload. The `prisma.config.ts` in the project root configures seed path for Prisma 7's CLI.

## Production Deployment

**Deploy only when explicitly instructed — never deploy automatically.**

- App runs on port **3001**
- PostgreSQL runs on port **5433**
- Target: DigitalOcean Droplet named **`yangyuen`**
- DO NOT run `npm run dev` or start local servers as a substitute for deployment
- API key is stored in `.env.local` (not committed) — never hardcode credentials in source files

## Agent Pipeline

Claude agent profiles are under `.claude/agents`. Read a profile only when a task needs that role or the user asks for it. Do not load all profiles automatically.

When a development task arrives, read `.claude/agents/pipeline-orchestrator.md` first and follow its instructions to orchestrate the pipeline inline — reading each subsequent agent profile as the orchestrator routes work to that stage.
