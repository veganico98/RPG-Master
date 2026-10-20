FROM node:22-alpine

# pnpm version pinned to match .mise.toml
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate

WORKDIR /app

# Copy only the manifests first so `pnpm install` is cached across rebuilds
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ai/package.json ai/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile

# Rest of the source (overwritten by the bind mount in docker-compose.yml
# during local dev — kept here so the image also runs standalone)
COPY . .

EXPOSE 8443 3001

CMD ["pnpm", "dev:all"]
