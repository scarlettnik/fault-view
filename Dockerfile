# syntax=docker/dockerfile:1

FROM node:24.15.0-bookworm-slim AS node-base
WORKDIR /srv/faultview

FROM node-base AS spa-build
COPY apps/frontend/package.json apps/frontend/package-lock.json apps/frontend/
RUN --mount=type=cache,target=/root/.npm npm --prefix apps/frontend ci
COPY apps/frontend/ apps/frontend/
COPY examples/projects.json examples/
ENV VITE_API_URL=/api/v1 \
    VITE_BASE_PATH=/app/
RUN npm --prefix apps/frontend run build

FROM node-base AS landing-build
COPY apps/landing/ apps/landing/
RUN npm --prefix apps/landing run build

FROM node-base AS demo-build
COPY examples/ examples/
RUN --mount=type=cache,target=/root/.npm node examples/tooling/build.mjs --workspace

FROM node-base AS api
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY apps/backend/package.json apps/backend/package-lock.json apps/backend/
RUN --mount=type=cache,target=/root/.npm \
    npm --prefix apps/backend ci --omit=dev \
    && npm --prefix apps/backend exec -- playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s apps/backend/node_modules node_modules

COPY apps/backend/src/ apps/backend/src/
COPY apps/frontend/src/core/ apps/frontend/src/core/
COPY examples/projects.json examples/
COPY examples/storefront/openapi.json examples/storefront/
COPY --from=spa-build /srv/faultview/apps/frontend/dist/ public/

ENV NODE_ENV=production \
    FAULTVIEW_HOST=0.0.0.0 \
    FAULTVIEW_SPA_DIST=/srv/faultview/public
WORKDIR /srv/faultview/apps/backend
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --retries=10 \
    CMD node --input-type=module -e \
        'const response = await fetch("http://127.0.0.1:3001/health"); process.exitCode = Number(!response.ok)'
CMD ["node", "--import", "tsx", "src/server.ts"]

FROM node-base AS demo
COPY examples/package.json examples/projects.json examples/
COPY examples/pages/api.js examples/pages/
COPY examples/storefront/ examples/storefront/
COPY --from=demo-build \
    /srv/faultview/examples/open-source/.runtime/workspace/ \
    examples/open-source/.runtime/workspace/

ENV NODE_ENV=production \
    FAULTVIEW_DEMO_HOST=0.0.0.0
USER node
EXPOSE 4400
CMD ["node", "examples/storefront/server.mjs"]

FROM caddy:2.10-alpine AS proxy
COPY --from=landing-build /srv/faultview/apps/landing/dist/ /srv/landing/
COPY deploy/Caddyfile /etc/caddy/Caddyfile
