FROM node:24.22.3-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# The generated Prisma client is built in the build stage; no runtime install hooks are needed.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM build AS init
USER node
CMD ["sh", "-c", "npm run db:deploy && npm run data:bootstrap"]

FROM base AS api
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
