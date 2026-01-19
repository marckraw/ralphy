FROM node:20-slim

# Install git and other dependencies
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/webhook-service/package.json ./apps/webhook-service/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/webhook-service ./apps/webhook-service
COPY tsconfig.json ./

# Build
RUN pnpm --filter @ralphy/shared build
RUN pnpm --filter @ralphy/webhook-service build

WORKDIR /app/apps/webhook-service

EXPOSE 3000

CMD ["node", "dist/index.js"]
