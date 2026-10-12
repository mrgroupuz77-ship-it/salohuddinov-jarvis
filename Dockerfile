# Salohuddinov Jarvis — production image (Railway, Render, Fly, any Docker host).
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    EVE_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# eve evaluates agent/agent.ts at build time. The real MODEL_ID comes from the
# runtime environment; this placeholder only satisfies the build step.
ARG MODEL_ID=build-placeholder
RUN MODEL_ID="$MODEL_ID" node node_modules/eve/bin/eve.js build \
 && npm prune --omit=dev --no-audit --no-fund

# Everything that must survive a redeploy lives on the mounted volume (/data):
# the database (PGlite) and eve's durable session store. `eve start` always
# uses .eve/.workflow-data, so that path is a symlink into the volume.
RUN rm -rf .eve/.workflow-data && ln -s /data/workflow .eve/.workflow-data
ENV DATABASE_URL=pglite:/data/jarvis \
    APP_TIMEZONE=Asia/Tashkent

EXPOSE 3000
CMD ["sh", "-c", "mkdir -p /data/workflow && exec node node_modules/eve/bin/eve.js start --host 0.0.0.0 --port ${PORT:-3000}"]
