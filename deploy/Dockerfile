# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
ARG VITE_FREEFALL_SERVER
ENV VITE_FREEFALL_SERVER=${VITE_FREEFALL_SERVER}
RUN npm run build

# Colyseus game server
FROM node:24-alpine AS game
WORKDIR /app
ENV NODE_ENV=production FREEFALL_HOST=0.0.0.0 FREEFALL_PORT=2567
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --omit=dev -w @freefall/server && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist
USER node
EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]

# Static client + reverse proxy
FROM nginx:1.30.6-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
