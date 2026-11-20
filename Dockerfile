ARG NOTION_PAGE_ID=

# Install dependencies only when needed
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:22-alpine AS builder
ARG NOTION_PAGE_ID
ENV NOTION_PAGE_ID=$NOTION_PAGE_ID
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
EXPOSE 3000
CMD ["./node_modules/.bin/next", "start"]
