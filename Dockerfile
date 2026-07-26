FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/h5p-runtime/package.json services/h5p-runtime/package-lock.json ./services/h5p-runtime/
RUN npm ci \
    && npm ci --prefix services/h5p-runtime

FROM node:22-bookworm-slim AS builder

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/services/h5p-runtime/node_modules ./services/h5p-runtime/node_modules
COPY . .
RUN npm run build:node

FROM node:22-bookworm-slim AS runtime

ENV HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

RUN groupadd --system learnershub \
    && useradd --system --gid learnershub --home-dir /app learnershub

COPY --from=builder --chown=learnershub:learnershub /app/public ./public
COPY --from=builder --chown=learnershub:learnershub /app/.next/standalone ./
COPY --from=builder --chown=learnershub:learnershub /app/.next/static ./.next/static

USER learnershub

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
