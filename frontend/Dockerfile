FROM node:20-alpine AS build-stage

WORKDIR /app
RUN corepack enable

COPY .npmrc package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .

# Force SSR mode with explicit environment variables
ENV NODE_ENV=production
ENV NUXT_SSR=true
ENV NITRO_PRESET=node-server

# Build the application with explicit SSR
RUN pnpm nuxt build --prerender=false

# SSR
FROM node:20-alpine AS production-stage

WORKDIR /app

# Copy only what's needed
COPY --from=build-stage /app/.output/ ./.output/
COPY --from=build-stage /app/package.json ./package.json

# Environment variables
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
ENV NUXT_SSR=true

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]