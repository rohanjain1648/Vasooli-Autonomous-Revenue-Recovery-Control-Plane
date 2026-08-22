# Multi-stage Dockerfile for Vasooli Control Plane
FROM node:20-alpine AS base

# Enable pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Dependencies Stage
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
COPY playbooks/ playbooks/

RUN pnpm install --frozen-lockfile

# Build Stage
FROM dependencies AS builder
ENV NODE_ENV=production
RUN pnpm -r --if-present run build

# Engine Runner
FROM base AS engine-runner
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=builder /app /app
EXPOSE 4000
CMD ["pnpm", "--filter", "@vasooli/engine", "start"]

# Web Dashboard Runner
FROM base AS web-runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=builder /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@vasooli/web", "start"]
