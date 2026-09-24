# syntax=docker/dockerfile:1

# 构建（在仓库根目录执行）：docker build -t tsaas-be ./be
FROM node:22-slim

# Prisma 运行时依赖 openssl
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_URL="file:/app/data/dev.db"

# 先装依赖，充分利用 layer 缓存
COPY package.json package-lock.json ./
RUN npm ci

# 生成 Prisma Client（SQLite，无需连接数据库）
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

# 数据目录需可写（挂载卷时请保证归属 node 用户）
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# schema 未使用 migrations，启动前用 db push 确保表结构存在
# 持久化：docker run -v tsaas-data:/app/data ...
# 初始化种子数据：docker run --rm -v tsaas-data:/app/data <image> npx tsx prisma/seed.ts
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx src/index.ts"]
