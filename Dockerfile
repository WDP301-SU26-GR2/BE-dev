# syntax=docker/dockerfile:1.7

# ---------- Base ----------
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

# ---------- Build (cài full deps -> generate prisma -> build dist) ----------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ---------- Runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY --from=build /app/prisma       ./prisma
COPY --from=build /app/package.json ./package.json

USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
