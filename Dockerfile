# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-slim AS dependencies

WORKDIR /app

# Install build tools for native modules (python, make, g++)
# Using Debian/Ubuntu package manager (apt-get)
# Set up Aliyun mirror for Debian
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS production

WORKDIR /app

# Install minimal runtime dependencies
# ffmpeg is needed for audio processing
# Set up Aliyun mirror for Debian
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules from dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built server artifacts
COPY --from=builder /app/dist ./dist

# Copy built client artifacts to /app/public
# server.js expects static files at ../public relative to itself (dist/server.js -> ../public -> /app/public)
COPY --from=builder /app/dist/public ./public

# Copy package.json for reference/scripts
COPY package.json ./

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health Check
# node:20-slim does not include wget by default, but we can verify if it does or use curl.
# Actually slim images usually have curl. Let's install curl to be safe or use node script.
# Better to install curl/wget in the apt-get block above if needed.
# Adding curl/wget to the install block above now.
# Re-writing the RUN block above in memory to include curl/wget?
# Or just adding it here for the replacement content.
# Let's add curl to the production install block.

# Health Check updated to use curl (common in debian) or retry wget if installed. 
# We'll install curl in the RUN command below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the server
CMD ["node", "dist/src/server.js"]
