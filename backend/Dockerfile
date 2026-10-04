# Backend Dockerfile for Sologix Attendance API
FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Set timezone
ENV TZ=Asia/Kolkata
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install dependencies
COPY package.json bun.lock ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma Client
RUN bun x prisma generate

EXPOSE 5000

# Run migrations and start server
CMD ["sh", "-c", "bun x prisma migrate deploy && bun run server.ts"]
