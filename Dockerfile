# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS construccion

WORKDIR /app


COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package-lock.json apps/server/
COPY apps/web/package.json apps/web/package-lock.json apps/web/
COPY apps/web/scripts apps/web/scripts

RUN npm ci && npm ci --prefix apps/server && npm ci --prefix apps/web

COPY . .

RUN npm run build
RUN npm prune --omit=dev --prefix apps/server


FROM node:24-bookworm-slim AS final

ENV NODE_ENV=production \
    PORT=9003 \
    HOST=0.0.0.0 \
    ODES_REINDEXAR=desactivado

WORKDIR /app

COPY --from=construccion /app/apps/server/package.json apps/server/package.json
COPY --from=construccion /app/apps/server/node_modules apps/server/node_modules
COPY --from=construccion /app/apps/server/dist apps/server/dist
COPY --from=construccion /app/apps/server/db apps/server/db
COPY --from=construccion /app/apps/server/datos apps/server/datos
COPY --from=construccion /app/apps/web/dist apps/web/dist

USER node

# Documenta el puerto (no lo abre: eso lo hace -p en docker run o Cloud Run).
EXPOSE 9003

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 9003) + '/api/salud').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--enable-source-maps", "apps/server/dist/main.js"]
