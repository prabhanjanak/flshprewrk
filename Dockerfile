# ==============================================================================
# SANKARA ACADEMY OF VISION — FELLOWSHIP EXAM SYSTEM
# Multi-stage Containerized Production Dockerfile
# ==============================================================================

# --- Stage 1: Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native binaries (if needed)
RUN apk add --no-cache python3 make g++ git

# Enable pnpm
RUN npm install -g pnpm@11.13.0

# Copy workspace package manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/fellowship-exam/package.json ./artifacts/fellowship-exam/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/

# Install all workspace dependencies
RUN pnpm install

# Copy source trees
COPY . .

# Build workspace libraries & frontend
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/fellowship-exam run build

# Build API server single-file production bundle
WORKDIR /app/artifacts/api-server
RUN node ./build.mjs

# --- Stage 2: Minimal Production Runtime ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002

# Install curl for container healthchecks
RUN apk add --no-cache curl tzdata

# Set timezone
ENV TZ=Asia/Kolkata

# Create directories for persistent uploads and static assets
RUN mkdir -p /app/uploads /app/dist /app/artifacts/fellowship-exam/dist /app/public \
             /app/artifacts/api-server/assets /app/assets /app/api/assets /app/extracted_logos

# Copy compiled backend bundle from builder
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Copy compiled frontend SPA bundle to static locations
COPY --from=builder /app/artifacts/fellowship-exam/dist ./artifacts/fellowship-exam/dist
COPY --from=builder /app/artifacts/fellowship-exam/dist ./public

# Copy logo and required static assets for PDF generators and UI
COPY --from=builder /app/artifacts/fellowship-exam/src/assets ./artifacts/fellowship-exam/src/assets
COPY --from=builder /app/artifacts/api-server/assets ./artifacts/api-server/assets
COPY --from=builder /app/artifacts/api-server/assets ./assets
COPY --from=builder /app/api/assets ./api/assets
COPY --from=builder /app/extracted_logos ./extracted_logos

# Copy node_modules needed for runtime external modules (e.g. sharp, pdfkit, pg, archiver)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

# Ensure uploads directory has correct permissions
RUN chmod -R 777 /app/uploads

EXPOSE 3002

# Docker Healthcheck (gives 30s start-period for PostgreSQL & automatic DB bootstrap)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3002/api/healthz || exit 1

# Launch production server
CMD ["node", "./dist/index.mjs"]
