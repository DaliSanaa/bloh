# Build stage
FROM node:20-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-slim AS production

RUN apt-get update \
  && apt-get install -y --no-install-recommends imagemagick python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY public ./public

RUN mkdir -p /app/data \
  && groupadd --system bloh \
  && useradd --system --gid bloh --create-home bloh \
  && chown -R bloh:bloh /app

USER bloh

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/bloh.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
