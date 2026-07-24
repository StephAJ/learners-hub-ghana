FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev

ARG H5P_CORE_REVISION=2aeb0b83fa603e331381b3a6b8bf42c3773ba140
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/h5p/core \
    && curl --fail --location --silent --show-error \
      "https://github.com/h5p/h5p-php-library/archive/${H5P_CORE_REVISION}.tar.gz" \
      | tar -xz --strip-components=1 -C /opt/h5p/core

FROM node:22-bookworm-slim AS runtime

ENV H5P_CORE_DIR=/app/h5p/core \
    H5P_DATA_DIR=/data \
    NODE_ENV=production \
    PORT=8080

WORKDIR /app

RUN groupadd --system learnershub \
    && useradd --system --gid learnershub --home-dir /app learnershub \
    && mkdir -p /app/h5p/core /data \
    && chown -R learnershub:learnershub /app /data

COPY --from=builder --chown=learnershub:learnershub /app/build ./build
COPY --from=builder --chown=learnershub:learnershub /app/node_modules ./node_modules
COPY --from=builder --chown=learnershub:learnershub /app/package.json ./
COPY --from=builder --chown=learnershub:learnershub /opt/h5p/core ./h5p/core

USER learnershub

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "build/index.js"]
