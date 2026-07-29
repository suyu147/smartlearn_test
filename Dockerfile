# =============================================================================
# SmartLearn — Multi-stage Docker Build
# Phase 6: Docker deployment
# =============================================================================
# Build:   docker compose build
# Run:     docker compose up -d
# Verify:  curl http://localhost:3000/api/v1/health
# =============================================================================

# -- Base image ---------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# -- Dependencies (cache-friendly) --------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy lock files first for cache efficiency
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci 2>/dev/null || npm install

# -- Builder ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (needed at build time for type generation)
RUN npx prisma generate

# Build Next.js with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# -- Runner (production image) ------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install curl for Docker healthcheck (wget not available in alpine by default)
RUN apk add --no-cache curl

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone server
COPY --from=builder /app/.next/standalone ./

# Copy static assets (Next.js requires these outside standalone)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Copy full node_modules from builder.
# Rationale: serverExternalPackages (@langchain/core, @langchain/langgraph) and
# dynamically imported packages (@modelcontextprotocol/sdk) have many transitive
# dependencies that Next.js standalone does NOT trace. Copying the full tree is
# the only reliable way to avoid MODULE_NOT_FOUND at runtime.
COPY --from=builder /app/node_modules ./node_modules

# Copy Prisma schema + migrations for runtime `prisma migrate deploy` in entrypoint
COPY --from=builder /app/prisma ./prisma

# Copy prompt templates (read at runtime via fs.readFileSync, NOT traced by standalone)
COPY --from=builder /app/lib/generation/prompts ./lib/generation/prompts

# Copy entrypoint script
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create data directory for local disk storage (mounted as volume in compose)
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data /app/lib

# Switch to non-root user
USER nextjs

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
