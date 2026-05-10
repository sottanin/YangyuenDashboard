# ============================================================
# Stage 1: deps — install all dependencies (cached layer)
# ============================================================
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package manifests first to maximise layer cache reuse.
# If package-lock.json hasn't changed, this layer is served from cache.
COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts

# ============================================================
# Stage 2: builder — generate Prisma client + Next.js build
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Bring in installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files needed for the build
COPY . .

# prisma generate does NOT connect to the database — it reads the schema
# and generates the TypeScript/JS client. A placeholder URL is sufficient.
# The real DATABASE_URL is injected at runtime by docker-compose.
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/yangyuen?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1

# Generate the Prisma client so it is embedded in the build output.
# @prisma/adapter-pg uses the native pg driver — the generated client
# must be present before `next build` resolves imports from src/lib/prisma.ts.
RUN npx prisma generate

# Production Next.js build.
# Standalone output bundles only what is needed for runtime:
# server.js + .next/standalone + .next/static
RUN npm run build

# ============================================================
# Stage 3: runner — lean production image
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL is overridden at runtime via docker-compose environment block
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/yangyuen?schema=public"

# Create a non-root user — never run Node as root in production
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy the production build artifacts from builder.
# We do NOT copy node_modules in full — Next.js standalone bundles its own
# minimal node_modules under .next/standalone/node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/public            ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone  ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static      ./.next/static

# Prisma generated client lives inside node_modules/.prisma and
# @prisma/client. The standalone bundler does not always include native
# binaries, so we copy the full generated client explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma          ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma          ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg               ./node_modules/pg

# Copy prisma schema so runtime migrations / studio still work if needed
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

# Health check — hits the root path; replace with /api/health if you add one
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

# next start via the standalone server entry point
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
