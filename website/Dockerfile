# Website Dockerfile for Sologix Admin Dashboard
FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Set timezone
ENV TZ=Asia/Kolkata
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start"]
