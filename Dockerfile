FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@12.4.2
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM oven/bun:1.3.14

WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/dist ./dist

EXPOSE 3001
CMD ["bun", "run", "backend/server.ts"]