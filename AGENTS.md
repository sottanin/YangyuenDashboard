# Repository Guidelines

## Project Structure & Module Organization

Next.js App Router dashboard backed by Prisma 7 + PostgreSQL. App code lives in `src/`.

```
src/
  app/
    admin/login/            # the only unauthenticated UI page
    dashboard/              # /dashboard/** — requires admin session
      analytics, reports,
      transactions, redemptions, tokens, wallets,
      batch-logs, contracts, workspaces, admin-users, settings
    api/
      auth/{login,logout}   # public — sets/clears session cookie
      stats, transactions, redemptions, wallets, tokens
      charts/{volume,heatmap}
      admin-users/[id]
      workspaces/[id]
      contracts/{token,address}/[id]
      batch/{run,cancel,logs}
      config
    page.tsx                # redirects to /dashboard
    layout.tsx, globals.css
    middleware.ts           # guards /dashboard/** and /api/** (except /api/auth)
  components/
    layout/                 # DashboardShell, Sidebar, TopBar
    ui/                     # Card, KpiTile, PageHeader, ErrorCard, SkeletonCard, Icon
    charts/                 # pure SVG chart components + chartUtils.ts
    ThemeProvider.tsx
  lib/
    prisma.ts               # singleton, PrismaPg adapter
    auth/{session,admin,password}.ts
    batchJob.ts             # KubScan fetcher used by /api/batch/run
    WorkspaceContext.tsx    # client-side workspace selector
prisma/
  schema.prisma, migrations/, seed.ts
public/                     # static assets (logo, favicon)
.claude/
  agents/                   # specialist agent profiles
  docs/TODO.md              # durable checklist for /start-feature
```

## Build, Test, and Development Commands

Local development runs in Docker. Do not use `npm run dev` as a substitute for Docker — see CLAUDE.md.

- `docker compose up --build -d` — start app (`localhost:3001`) and Postgres (`localhost:5433`)
- `docker compose logs -f web` — follow application logs
- `docker compose down` — stop everything
- `npm run build` — Next.js production build and TypeScript check
- `npm run lint` — ESLint via the flat config (`eslint.config.mjs`)
- `npx prisma migrate dev --name <name>` — create and apply a local migration
- `npx prisma generate` — regenerate the client after schema edits
- `npx prisma db seed` — run `prisma/seed.ts` via `tsx` (imports the Excel data files)

No automated test framework is configured. Lint and build are the only required checks before handoff.

## Required Environment Variables

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/yangyuen?schema=public"
AUTH_SECRET="<32+ random bytes>"            # required — session.ts throws if missing
SUPERADMIN_INITIAL_PASSWORD="<optional>"    # auto-generates a printed password if absent
```

`.env` is never committed. `docker-compose.yml` reads `AUTH_SECRET` and `SUPERADMIN_INITIAL_PASSWORD` from the host environment and passes them into the container.

## Coding Style & Naming Conventions

- TypeScript strict, React function components, two-space indentation, single quotes for imports
- Components use `PascalCase` filenames, hooks and helpers use `camelCase`, App Router folders use lowercase route names
- Server Components by default; mark Client Components with the `'use client'` directive
- Place reusable UI in `src/components`, server helpers in `src/lib`, and route-local logic next to the route that owns it
- All database access goes through the `prisma` singleton in `src/lib/prisma.ts`
- Chart colors that need to resolve CSS custom properties must go through `resolveColor()` / `useResolvedColors()` (see CLAUDE.md)

## Auth Conventions

- Server components that should be admin-only must call `requireAdmin()` from `src/lib/auth/admin.ts`
- API routes that mutate state must call `getCurrentAdmin()` and return `401` if it is `null` — middleware only checks for a valid session, not authorization
- Never `require('crypto')` inside a function; use top-level `import` so the bundler resolves it at build time
- Never reintroduce a fallback secret in `session.ts` — `AUTH_SECRET` must throw when unset

## Database Conventions

- Transaction data is stored as paired header/detail tables (`TransactionHeader`/`TransactionDetail`, `RedemptionTransactionHeader`/`RedemptionTransactionDetail`). There is no flat `Transaction` model.
- Wei → decimal conversion uses string padding (see `fromWei` in `batchJob.ts`); never use `Number()` on raw wei values
- Add a Prisma migration for any schema change and check that it applies cleanly against a fresh database before handoff

## Blockchain Transaction Domain Model

Use the following business model when implementing transaction queries, classifications, reports, charts, or reconciliation. The effective history begins at `2025-10-29 14:02:37` as supplied by the business. Do not infer business events from a single address field alone.

### Header/detail semantics

- `TransactionHeader` represents one blockchain transaction, uniquely identified by `txId`. It stores transaction-level facts: `timestamp`, `txValue`, `fee`, `block`, `status`, `result`, `gasPrice`, and `gasUsed`.
- `TransactionDetail` represents one token-transfer/log event within that transaction. It stores `fromHash`, `toHash`, `method`, token metadata, decimal value, `txType`, and event timestamp. Its unique event key is normally `<log_index>_<tx_hash>`.
- One `TransactionHeader` can have many `TransactionDetail` rows through `TransactionDetail.txId -> TransactionHeader.txId`. Mint, lock, distribution, swap, fee, and burn legs may therefore share one header or span several related headers.
- Redemption data uses the same 1:N pattern: `RedemptionTransactionHeader` contains transaction-level fields and `RedemptionTransactionDetail` contains KAP-721 transfer events and `tokenId`. The redemption header field is named `value`, not `txValue`.
- Insert or upsert the header before its details. Do not add or query a nonexistent flat `Transaction` model, and do not expect From, To, token, or method fields on a header.
- Fee Update enriches both header tables from KubScan transaction data. Token sync and redemption sync create headers with fee `0` until that enrichment runs.

### Canonical token registry

For this project, Token Address and Token Contract Address mean the same address. Address matching must be case-insensitive, while stored/raw values should be preserved for traceability.

| Business standard | Token | Symbol | Token/contract address |
|---|---|---|---|
| KAP-20 | ICC-YANGYUEN | ICCYYN | `0x176458708C6C5F91745E19683AbA93681e16110B` |
| KAP-22 | Fit | FIT | `0x765fdD2333003814b8B0c132bC0f40bf90D55BB9` |
| KAP-22 | Green | GRN | `0x3e19685894F822ec9E9caa752f459750a2B7ab44` |
| KAP-22 | Integrity | INT | `0x4E407c438bF2Cafc30e63dec17d77c9cc642cf93` |
| KAP-22 | Together | TGT | `0xB4c77F6c02b661750c4386d3D391167B4D443fF7` |

KAP-22 contracts also receive and lock ICCYYN to back Point Token minting and swapping. KubScan payloads and current fallback strings may use ERC-style names such as `ERC-20` or `ERC-721`; do not use the stored `tokenType` string by itself to contradict the KAP business classification.

### Canonical wallet and system-contract registry

| Role | Address | Business meaning |
|---|---|---|
| Zero Wallet | `0x0000000000000000000000000000000000000000` | Mint source and burn destination |
| Initial Mint Wallet | `0xCddFB85F74F48D7C90B4126e01007583503537fD` | Receives the initial ICCYYN supply before Point Token preparation |
| Main Wallet | `0xeDdF22523776d06B46DCc96768A8DfD01f5B1ff6` | Holds remaining ICCYYN and funds Point Token minting |
| Workspace Wallet | `0x11fa8Be7383AeD9549EB1693295F4a4A4B8C42AC` | Routes ICCYYN from Main Wallet to a Point Token contract |
| DistributorPool | `0xd8FF598242e87EA33055E2bAE38e5E7855206EA1` | Receives minted KAP-22 and distributes it to users |
| OperationPool | `0x5375D9B6d9289F4b6c8C59734713764c4c1127D9` | Receives minted KAP-22 and distributes it to users |
| Loyalty Swap | `0x3270a1658E43fc5d7A0aE947A552cA916F76A05e` | Exchanges user KAP-22 for locked ICCYYN |
| Loyalty Marketplace v1 | `0x56ef6445CC79801b3a6b41319D996cFf8f901ac2` | Legacy redemption marketplace contract |
| Loyalty Marketplace v2 | `0x032B2668EEf54b165A2D969Eab94f57d2bf546E4` | Upgraded redemption marketplace contract |
| Loyalty Marketplace Fee | `0x2Dd756BEfD774AcB510a4389DBFDd34CBAeA1F0b` | Receives the marketplace fee |

Marketplace v1 and v2 are versions of the same business role. Aggregate them together for business totals, but retain the raw address/version for auditability and deduplicate by transaction/event identity so an upgrade or multi-log transaction is not double-counted.

### Canonical token flows

1. **Initial ICCYYN creation:** Zero Wallet mints ICCYYN to Initial Mint Wallet. ICCYYN used for Point Token preparation proceeds through that wallet, and the remaining supply is transferred to Main Wallet.
2. **Mint Point Token into a pool:** Main Wallet sends ICCYYN to Workspace Wallet; Workspace Wallet sends ICCYYN to the selected FIT, GRN, INT, or TGT contract to lock it; Zero Wallet then mints the corresponding KAP-22 quantity into DistributorPool or OperationPool according to business logic.
3. **Distribute Point Token:** DistributorPool or OperationPool transfers KAP-22 to a User Wallet after the user participates in an activity.
4. **Swap Point Token back to ICCYYN:** User Wallet transfers KAP-22 to Loyalty Swap; the relevant Point Token contract supplies the ICCYYN previously locked according to the swap logic; Loyalty Swap transfers ICCYYN to the User Wallet; the received KAP-22 is sent to Zero Wallet and treated as burned.
5. **Marketplace redemption:** User Wallet transfers ICCYYN to Marketplace v1 or v2; the marketplace transfers its fee portion to Loyalty Marketplace Fee; Zero Wallet mints the KAP-721 redemption NFT to the User Wallet.
6. **Use a redemption NFT:** When the user uses the NFT, the KAP-721 token is transferred from the User Wallet to Zero Wallet. Treat this as burned/used and no longer active.

For analytics, derive events using the combination of normalized token address, normalized From/To addresses, transaction hash, event key/log index, method, timestamp, and value. A transfer from Zero Wallet is a mint only in the context of the relevant token; a transfer to Zero Wallet is a burn only in the relevant swap or NFT-use flow. Do not classify solely from a display name or one address.

The runtime redemption sync currently uses the hard-coded NFT contract `0xe089bc4b774b03f1D5F8C3f624603643F0718B62` in `src/lib/batchJob.ts`. Treat that as the current ingestion implementation, while the rules above define the business lifecycle. The database currently stores raw header/detail events and NFT ownership data; derived labels such as “locked,” “distributed,” “swapped,” “active,” and “used” are business interpretations unless explicitly materialized by a future schema change.

## Testing & Verification Guidelines

Until a test runner is added:

- `npm run lint` + `npm run build` are the gate before handoff
- For database changes, run the new migration locally and spot-check via `npx prisma studio`
- For UI changes, verify in the running Docker container at `http://localhost:3001`
- For deploy work, follow the smoke tests in `.claude/docs/TODO.md`

If a test runner is added later, prefer colocated `*.test.ts` / `*.test.tsx` and document the command in `package.json`.

## Commit & Pull Request Guidelines

- Short imperative commit messages (`Add workspace filter to wallets`, `Fix batch cancel race`)
- Reference incident or requirement context in the body, not the subject
- Never `--no-verify`; fix hook failures rather than skip them
- Pull requests should list: summary, verification steps (lint/build/manual), screenshots for dashboard UI changes, notes for schema or environment changes
- Never commit `.env`, `.env.local`, `.codex/`, `.information/`, or exported spreadsheets

## Security & Configuration Tips

- Treat `AUTH_SECRET`, `SUPERADMIN_INITIAL_PASSWORD`, `POSTGRES_PASSWORD`, and `DATABASE_URL` as secrets — keep them in `.env` and out of source
- Mutating API routes must enforce admin-only access at the route handler, not only in the middleware
- Prisma migrations affect persisted dashboard data — review carefully and back up before destructive migrations
- The `xlsx` import path runs only in the seed; do not introduce it into runtime API routes (denial-of-service risk on large uploads)

## Production Deployment Notes

Production runs on the DigitalOcean droplet `yangyuen` (`159.89.193.59`). Two stacks share the droplet:

| Stack | App port | Postgres port | Domain |
|---|---|---|---|
| `yangyuen` (main site) | 3000 | 5432 | `yangyuen.com` |
| `yangyuen-dashboard` (this repo) | 3001 | 5433 | `dashboard.yangyuen.com` |

- Caddy runs as the Docker container `yangyuen-caddy-1` on the shared `yangyuen_default` network (referenced as `caddy_proxy` in compose). It terminates TLS for both domains.
- Cloudflare proxies `dashboard.yangyuen.com` (DNS + edge). Cloudflare Page Rules and SSL/TLS mode are managed in the Cloudflare dashboard, not on the droplet.
- The dashboard Caddyfile fragment at `/etc/caddy/dashboard/Caddyfile` already reverse-proxies to `yangyuen-dashboard-app:3000` over the shared docker network. Do not touch the `yangyuen.com` block under any circumstance.
- Bind all app and database ports to `127.0.0.1` on the droplet unless there is a specific reason to expose them publicly.

### Deploy flow (image-based, not git pull)

The droplet's `/opt/yangyuen-dashboard/` is not a git checkout — it holds only `.env` and `deploy-dashboard.compose.yml`, which references a pre-built image by tag.

1. Build locally: `docker build --platform linux/amd64 -t yangyuen-dashboard:deploy-YYYYMMDD-amd64 .`
2. Ship: `docker save <image> | gzip | ssh root@159.89.193.59 'docker load'`
3. Bump `TAG=` in `/opt/yangyuen-dashboard/.env`
4. `ssh root@... 'cd /opt/yangyuen-dashboard && docker compose -f deploy-dashboard.compose.yml up -d app'`
5. Smoke `https://dashboard.yangyuen.com` AND `https://yangyuen.com` (regression check on the sister stack)

Rollback by reverting the `TAG=` line to the previous value and re-running step 4.

## Agent Pipeline

`.claude/agents/` contains six specialist profiles. Read a profile only when a task needs that role; do not load them all up front.

- `pipeline-orchestrator.md` — entry point; decomposes work and routes to the right specialist
- `ux-ui-designer.md` — UX/UI specs (not code)
- `fullstack-dev.md` — Next.js + Prisma + Tailwind implementation
- `security-agent.md` — OWASP review, auth review
- `qa-engineer.md` — test plans, smoke tests
- `devops-infra-engineer.md` — Docker, Caddy, deploys, rollbacks

Durable progress lives in `.claude/docs/TODO.md`. The `/start-feature` slash command extends or resumes this file so that an interrupted session can be picked up cleanly.
