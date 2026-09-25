# Production Dockerfile for Hellock Distributed Object Storage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies needed for production runtime
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build artifacts and source files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public 2>/dev/null || true
COPY --from=builder /app/data ./data
COPY --from=builder /app/services ./services
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/.env* ./

# Expose main web port and the 4 internal storage node ports
EXPOSE 3000 4001 4002 4003 4004

CMD ["npm", "run", "start"]
