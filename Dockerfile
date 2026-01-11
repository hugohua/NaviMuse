# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install build tools for native modules (python, make, g++)
RUN apk add --no-cache python3 py3-pip make g++

# Copy package files
COPY package*.json ./

# Install dependencies with cache mounting
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM dependencies AS builder

WORKDIR /app

# Copy source code
COPY . .

# Build application (client and server)
# client -> dist/public
# server -> dist
RUN npm run build

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Install minimal runtime dependencies
# (If you have python runtime deps, add them here, otherwise minimal node env is fine)
# The user's reference included python, assuming it might be needed for specific services or node-gyp rebuilds if any.
# Keeping it safe based on user's reference, though 'production' usually doesn't need build tools unless pre-gyp fails.
RUN apk add --no-cache python3 py3-pip

# Copy node_modules from dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built server artifacts
COPY --from=builder /app/dist ./dist

# Copy built client artifacts to /app/public
# server.js expects static files at ../public relative to itself (dist/server.js -> ../public -> /app/public)
COPY --from=builder /app/dist/public ./public

# Copy package.json for reference/scripts
COPY package.json ./

# Create non-root user (optional but good practice, skipping for simplicity unless requested or if permissions issues arise with mapped volumes)

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health Check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the server
CMD ["node", "dist/server.js"]
