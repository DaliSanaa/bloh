FROM ubuntu:24.04 AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM ubuntu:24.04 AS production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl imagemagick python3 make g++ \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY imagemagick-policy.xml /etc/ImageMagick-6/policy.xml
COPY --from=builder /app/dist ./dist
COPY public ./public

RUN mkdir -p /app/data \
  && groupadd --system bloh \
  && useradd --system --gid bloh --create-home bloh \
  && chown -R bloh:bloh /app

USER bloh

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/bloh.db

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
