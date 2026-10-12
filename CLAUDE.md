# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

Internal admin dashboard for the Yangyuen loyalty program. Surfaces KAP-20/KAP-22 token activity, KAP-721 redemptions, wallet balances, and contract metadata pulled from the KubChain blockchain via the KubScan API. Production URL: **https://dashboard.yangyuen.com** (Cloudflare → Caddy → Next.js on droplet port 3001).

Separate from the public `yangyuen.com` site, which runs as a different stack on the same droplet.

## Commands

```bash
# Development (local Docker only — never `npm run dev` as a substitute)
docker compose up --build -d           # build + run app (3001) + Postgres (5433)
docker compose logs -f web             # follow app logs
docker compose down                    # stop everything

# Build / lint (run inside or outside Docker)
npm run build                          # next build + TS check
npm run lint                           # eslint via flat config

# Prisma
npx prisma migrate dev --name <name>   # create + apply local migration
npx prisma generate                    # regenerate client after schema edits
npx prisma db seed                     # tsx prisma/seed.ts (imports Excel)
npx prisma studio                      # GUI on 5555
```

`.env` (required at project root):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/yangyuen?schema=public"
AUTH_SECRET="<random 32+ bytes>"
BATCH_SCHEDULER_SECRET="<random 32+ bytes>"
SUPERADMIN_INITIAL_PASSWORD="<optional — auto-generated if absent>"
```

Docker maps Postgres container port 5432 → host 5433. App container 3000 → host 3001.

## Stack

- **Next.js 16 App Router** — React 19, TypeScript strict, Server Components by default
- **Prisma 7** — `@prisma/adapter-pg` native driver via the singleton in `src/lib/prisma.ts`
- **PostgreSQL 16**
- **Tailwind CSS v4** — PostCSS only, no `tailwind.config.ts`; theming via CSS custom properties in `globals.css`
- **Pure SVG charts** — hand-rolled in `src/components/charts/` (no Recharts)
- **xlsx** — used only in `prisma/seed.ts` to import `Transactions.xlsx` and `Redemption Transactions.xlsx`

No test framework configured. Lint + build are the only automated checks.

## Auth

Session-based admin auth with HMAC-signed cookies (no NextAuth).

- **Login route**: `/admin/login` (only public page besides `/api/auth/*`)
- **Middleware**: `src/middleware.ts` guards `/dashboard/**` and `/api/**` (except `/api/auth/*`). Unauthenticated UI requests redirect to `/admin/login`; API requests return 401 JSON.
- **Session**: `src/lib/auth/session.ts` — HMAC-SHA256 of `{id, username, name, role, exp}` JSON payload using `AUTH_SECRET`. Cookie name `yy_admin_session`, TTL 8h. **Throws** if `AUTH_SECRET` is not set — never silently fall back to a default.
- **Password hashing**: `src/lib/auth/password.ts` — PBKDF2-SHA256, 310,000 iterations, format `pbkdf2_sha256$<iterations>$<salt>$<hash>`. Uses Node `crypto` (top-level import — do NOT `require('crypto')` inside functions).
- **Server helpers**: `src/lib/auth/admin.ts`
  - `ensureDefaultSuperAdmin()` — seeds `superadmin` user on first boot; uses `SUPERADMIN_INITIAL_PASSWORD` env var or generates a random 32-char hex and logs it once
  - `getCurrentAdmin()` — returns session admin record or `null`
  - `requireAdmin()` — redirects to `/admin/login` if no session; use in server components and server actions
- **Mutating API routes** must call `getCurrentAdmin()` and return 401 if missing. Examples: `/api/batch/run`, `/api/batch/cancel`, `/api/admin-users/[id]`, `/api/workspaces/[id]`.

## Theme System

`ThemeProvider` (`src/components/ThemeProvider.tsx`) is a client component that:

- Reads/writes `localStorage('nx-theme')` — values `light` | `dark` | `system`
- Toggles `.dark` class on `<html>`; all CSS vars respond to that class
- Listens to `prefers-color-scheme` when mode is `system`

CSS custom properties in `globals.css` use space-separated RGB: `--accent: 99 102 241`. In CSS: `rgb(var(--accent))`. In SVG (which can't resolve `var()` natively), use the chart utilities below.

## Chart Color Resolution

SVG `fill`/`stroke` cannot resolve `var(--accent)` natively. Utilities in `src/components/charts/chartUtils.ts`:

- `resolveColor(c)` — converts `var(--accent)` or `rgb(var(--accent))` → `rgb(99 102 241)` via `getComputedStyle`
- `useResolvedColors(colors[])` — React hook; re-resolves on `.dark` class change via `MutationObserver`
- `smoothPath(points)` — Catmull-Rom spline for smooth SVG paths
- `fmt(n)` — number formatter: `1_234_567 → "1.2M"`

## Dashboard Shell

`src/app/dashboard/layout.tsx` composes: `ThemeProvider` → `WorkspaceProvider` → `DashboardShell` (client) → page children.

`DashboardShell` (`src/components/layout/DashboardShell.tsx`) manages:

- Sidebar state (`open` 240px / `narrow` 68px / `closed` 0px), persisted in `localStorage('nx-sidebar')`
- Layout shift via `marginLeft` CSS transition
- Background layers: `.grid-bg` and `.ambient-bg` (fixed, pointer-events none)

## Sidebar Navigation

```
Workspace:  Overview (/dashboard), Analytics, Reports
Blockchain: Transactions, Redemptions, Tokens, Wallets
System:     Batch Logs, Contracts, Workspaces, Admin Users, Settings
```

## Workspace Context

`src/lib/WorkspaceContext.tsx` is a client-side selector that scopes which `TokenContract`/`AddressContract` rows are visible. The default selection is "All Workspaces" (`id: 'all'`). API routes that filter by workspace accept a `workspaceId` query param.

## Data Models

Prisma schema at `prisma/schema.prisma`. Transaction data is split into header/detail tables — there are no flat `Transaction` or `RedemptionTransaction` models.

| Model | Purpose |
|---|---|
| `TransactionHeader` / `TransactionDetail` | KAP-20/KAP-22 transfers/mints from KubScan; header holds tx-level fields (fee, gas, status); detail holds per-token-event rows |
| `RedemptionTransactionHeader` / `RedemptionTransactionDetail` | KAP-721 burns/transfers (loyalty redemptions) |
| `NFTInstance` | NFT metadata — food item names, IPFS images, owner hash |
| `Wallet` | Token balances named by canonical symbol: `ICCYYN`, `FIT`, `TGT`, `INT`, `GRN` |
| `TokenContract` | KAP-20/KAP-22/KAP-721 token registry with workspace ownership |
| `AddressContract` | Named addresses (Loyalty Marketplace, fee wallets, etc.), optional `workspaceId` |
| `Workspace` | Groups `TokenContract` + `AddressContract` |
| `BatchJobLog` | One row per scheduled fetch run — counts, status, stop reason |
| `AdminUser` | Username/email + PBKDF2 password hash + role (`admin` / `superadmin`) |
| `SystemConfig` | Generic key/value store for runtime settings |

Wallet balance columns must use the canonical token symbol exactly. Wallet Sync must map each balance column from an explicit, case-insensitive canonical contract-address → symbol allowlist; never derive the destination column from untrusted API name/symbol metadata. Add a migration and update the allowlist whenever a supported token is added.

## API Routes

All under `src/app/api/`, JSON only. Parallel Prisma reads use `Promise.all`. Mutating routes require an admin session.

```
GET  /api/stats                              # aggregate KPIs
GET  /api/transactions?page=&limit=&token=&type=
GET  /api/redemptions?page=&limit=
GET  /api/wallets?page=&limit=
GET  /api/tokens                             # token contract summary + NFT count
GET  /api/charts/volume                      # monthly TX volume series
GET  /api/charts/heatmap                     # 7×24 TX count grid (day × hour)

GET  /api/config                             # SystemConfig read
POST /api/config                             # SystemConfig write (admin only)

POST /api/auth/login                         # credentials → session cookie
POST /api/auth/logout                        # clears cookie

GET/POST /api/admin-users                    # list / create
GET/PATCH/DELETE /api/admin-users/[id]

GET/POST /api/workspaces                     # list / create
GET/PATCH/DELETE /api/workspaces/[id]

GET/POST /api/contracts/token
GET/PATCH/DELETE /api/contracts/token/[id]
GET/POST /api/contracts/address
GET/PATCH/DELETE /api/contracts/address/[id]

POST /api/batch/run                          # start fetch — admin only
POST /api/batch/cancel                       # cancel running job — admin only
GET  /api/batch/logs                         # list BatchJobLog rows
```

## Batch Pipeline

`src/lib/batchJob.ts` fetches token activity from the KubScan public API:

- Base URLs: `https://www.kubscan.com/api/v2/tokens` and `/api/v2/addresses`
- NFT contract: `0xe089bc4b774b03f1D5F8C3f624603643F0718B62`
- Wei-to-decimal conversion uses **string padding**, not `Number` — float precision would corrupt balances
- Each run writes a `BatchJobLog` row with totals, pages scanned, and a `status` of `running` → `success` / `cancelled` / `error`
- Job IDs are tracked so `/api/batch/cancel` can request a graceful stop

## Prisma Client

`src/lib/prisma.ts` uses the `PrismaPg` driver adapter (required by Prisma 7). Singleton pattern prevents connection pool exhaustion during Next.js hot-reload. `prisma.config.ts` at project root configures Prisma 7's CLI seed path.

## Production Deployment

**Deploy only when explicitly instructed — never deploy automatically.**

### Topology

- **Droplet**: DigitalOcean `yangyuen`, IP `159.89.193.59`, root user
- **Caddy**: runs as Docker container `yangyuen-caddy-1` (NOT a system service). It terminates TLS on the droplet and reverse-proxies by hostname. Sits on the external Docker network `yangyuen_default` (named `caddy_proxy` in compose files).
- **Cloudflare**: fronts `dashboard.yangyuen.com` (DNS + edge proxy). Cloudflare 308 redirect loops on the dashboard hostname are a Cloudflare-side concern, not a droplet regression.
- **Sister stack**: `yangyuen.com` is a separate repo on the same droplet — its Caddy block must not be touched.
- **Dashboard ports**: app `3001`, Postgres `5433` (bound to `127.0.0.1`, not publicly exposed)
- **Dashboard Caddyfile fragment**: lives at `/etc/caddy/dashboard/Caddyfile` inside the Caddy container — reverse-proxies `dashboard.yangyuen.com` to `yangyuen-dashboard-app:3000` on the shared docker network. Already configured; do not edit.

### Deploy pattern (image-based, NOT git pull)

The droplet's `/opt/yangyuen-dashboard/` is NOT a git checkout. It holds `.env` and `deploy-dashboard.compose.yml`, which references a pre-built image by tag.

1. Build locally for AMD64: `docker build --platform linux/amd64 -t yangyuen-dashboard:deploy-YYYYMMDD-amd64 .`
2. Transfer: `docker save <image> | gzip | ssh root@159.89.193.59 'docker load'`
3. Bump tag: `ssh root@159.89.193.59 'cd /opt/yangyuen-dashboard && sed -i "s/^TAG=.*/TAG=deploy-YYYYMMDD-amd64/" .env'`
4. Restart app only: `ssh ... 'docker compose -f deploy-dashboard.compose.yml up -d app'`
5. Smoke: `curl -sI http://localhost:3001` (on droplet) + `curl -sI https://yangyuen.com` (regression check)

The compose **service name on the droplet is `app`** (host container name `yangyuen-dashboard-dashboard-app-1`). The droplet `.env` must include `POSTGRES_PASSWORD`, `AUTH_SECRET`, `BATCH_SCHEDULER_SECRET`, `SUPERADMIN_INITIAL_PASSWORD`, `TAG`, and optionally `IMAGE_REPO`.

### Rollback

1. `sed -i "s/^TAG=.*/TAG=<previous-tag>/" /opt/yangyuen-dashboard/.env`
2. `docker compose -f /opt/yangyuen-dashboard/deploy-dashboard.compose.yml up -d app`

Previous tags remain on disk until pruned.

### Hard rules

- Never run `npm run dev` as a substitute for Docker
- Never commit `.env`, `.env.local`, `.codex/`, `.information/`, or exported spreadsheets
- Never `systemctl restart caddy` (it isn't a systemd service here) — and never `docker restart yangyuen-caddy-1` if the dashboard Caddyfile fragment changes; a `caddy reload` inside the container is safer
- Never edit any Caddyfile block that belongs to `yangyuen.com`
- Never skip git hooks (`--no-verify`) or force-push to `main`

## Agent Pipeline

Agent profiles live in `.claude/agents/`. Read a profile only when a task needs that role:

- `pipeline-orchestrator.md` — entry point; decomposes work and routes to other agents
- `ux-ui-designer.md` — spec writer (not code)
- `fullstack-dev.md` — Next.js + Prisma + Tailwind implementation
- `security-agent.md` — OWASP/auth review
- `qa-engineer.md` — test plans + smoke tests
- `devops-infra-engineer.md` — Docker, Caddy, deploy, rollback

When a development task arrives, read `pipeline-orchestrator.md` first and follow it — load downstream profiles only as the orchestrator routes work to them.

## Working files

- `.claude/docs/TODO.md` — durable checklist for the current feature/deploy. The `/start-feature` slash command extends or resumes this file. Tick boxes as work completes so a fresh session can pick up cleanly.
