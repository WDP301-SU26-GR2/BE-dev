# syntax=docker/dockerfile:1.7

# ---------- Base ----------
FROM node:22-slim AS base
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ⚠ PHẢI khớp major với pnpm sinh ra pnpm-lock.yaml. `overrides` (vá advisory F-03) khai ở
# pnpm-workspace.yaml — pnpm 9 KHÔNG đọc field đó (chỉ đọc package.json > pnpm.overrides) nên
# nó tính ra "0 overrides" trong khi lockfile khai 5 → `--frozen-lockfile` chết với
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. Đổi lockfile ở local mà quên đổi dòng này = vỡ CI.
ENV PNPM_VERSION=11.1.3
RUN npm install -g pnpm@${PNPM_VERSION} \
    && pnpm --version

# ---------- Build ----------
FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma generate
RUN pnpm build

# ---------- Prod deps only ----------
FROM base AS prod-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

RUN pnpx prisma@6 generate

# ---------- Runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

USER app

# PORT được nạp từ env lúc runtime, EXPOSE chỉ để document
ARG PORT=3000
EXPOSE ${PORT}

CMD ["node", "dist/main.js"]