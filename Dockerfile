FROM node:24.15.0-bookworm-slim AS base
WORKDIR /srv/faultview

FROM base AS spa
COPY apps/frontend/package.json apps/frontend/package-lock.json apps/frontend/
RUN npm --prefix apps/frontend ci
COPY apps/frontend/ apps/frontend/
COPY examples/projects.json examples/projects.json
ENV VITE_API_URL=/api/v1 VITE_BASE_PATH=/app/
RUN npm --prefix apps/frontend run build

FROM base AS landing
COPY apps/landing/ apps/landing/
RUN npm --prefix apps/landing run build

FROM base AS api
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY apps/backend/package.json apps/backend/package-lock.json apps/backend/
RUN npm --prefix apps/backend ci --omit=dev \
    && npm --prefix apps/backend exec -- playwright install --with-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s apps/backend/node_modules node_modules
COPY apps/backend/src/ apps/backend/src/
COPY apps/frontend/src/core/ apps/frontend/src/core/
COPY examples/projects.json examples/projects.json
COPY examples/storefront/openapi.json examples/storefront/openapi.json
COPY --from=spa /srv/faultview/apps/frontend/dist/ /srv/faultview/public/
ENV NODE_ENV=production FAULTVIEW_HOST=0.0.0.0 FAULTVIEW_SPA_DIST=/srv/faultview/public
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "src/server.ts"]
WORKDIR /srv/faultview/apps/backend

FROM base AS demo-assets
COPY examples/ examples/
RUN node examples/tooling/build.mjs --workspace

FROM base AS demo
COPY examples/package.json examples/package.json
COPY examples/projects.json examples/projects.json
COPY examples/pages/api.js examples/pages/api.js
COPY examples/storefront/ examples/storefront/
COPY --from=demo-assets /srv/faultview/examples/open-source/.runtime/workspace/ examples/open-source/.runtime/workspace/
ENV NODE_ENV=production FAULTVIEW_DEMO_HOST=0.0.0.0
USER node
EXPOSE 4400
CMD ["node", "examples/storefront/server.mjs"]

FROM caddy:2.10-alpine AS proxy
COPY --from=landing /srv/faultview/apps/landing/dist/ /srv/landing/
COPY deploy/Caddyfile /etc/caddy/Caddyfile
