# syntax=docker/dockerfile:1

# 在仓库根目录执行：
#   pnpm --filter be build
#   docker build -t tsaas-be .
ARG NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
FROM ${NODE_IMAGE} AS base

RUN apk add --no-cache openssl ca-certificates

FROM base AS builder

ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY be/package.json ./be/package.json
RUN pnpm install --filter be --frozen-lockfile

COPY be/prisma/schema.prisma ./be/prisma/schema.prisma
RUN pnpm --filter be exec prisma generate

# 生产依赖不含 Prisma CLI；生成好的 @prisma/client 从 pnpm 虚拟目录补进 deploy 产物。
RUN pnpm --filter be deploy --prod --legacy /prod
RUN set -eux; \
  src=$(find /app/node_modules/.pnpm -type d -path '*/node_modules/.prisma/client' | head -1); \
  dest=$(find /prod/node_modules/.pnpm -type d -path '*/node_modules/@prisma/client' | head -1); \
  cp -a "$(dirname "$src")" "$(dirname "$(dirname "$dest")")/"; \
  rm -rf /prod/prisma; \
  rm -f /prod/node_modules/.bin/prisma; \
  rm -rf /prod/node_modules/.pnpm/@prisma+engines@* \
         /prod/node_modules/.pnpm/@prisma+fetch-engine@* \
         /prod/node_modules/.pnpm/@prisma+get-platform@* \
         /prod/node_modules/.pnpm/@prisma+debug@*

FROM builder AS migrate

USER node
WORKDIR /app/be

FROM base AS runner

WORKDIR /app
RUN mkdir -p /app/data && chown -R node:node /app
USER node

COPY --from=builder --chown=node:node /prod /app/be
COPY --chown=node:node be/dist ./be/dist

WORKDIR /app/be
ENV NODE_ENV=production

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
