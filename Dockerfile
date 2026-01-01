# ==============================================================================
# Xero Integration Foundry - Docker MCP Server
# Multi-stage build for minimal production image
# ==============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (skip prepare script - we build explicitly below)
RUN npm ci --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ==============================================================================
# Stage 2: Production
# ==============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache libstdc++

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy test fixtures (needed for mock mode)
COPY --chown=nodejs:nodejs test/fixtures ./test/fixtures

# Copy database schema
COPY --chown=nodejs:nodejs src/core/db/schema.sql ./dist/core/db/schema.sql

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data /app/test

# Switch to non-root user
USER nodejs

# Environment defaults
ENV NODE_ENV=production
ENV MCP_MODE=mock
ENV MCP_DATABASE_PATH=/app/data/xerodev.db

# MCP servers use stdio, no ports needed
# The container communicates via stdin/stdout

# Entry point
CMD ["node", "dist/index.js"]

# Health check for container monitoring
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# ==============================================================================
# Labels for Docker MCP Toolkit
# ==============================================================================
LABEL org.opencontainers.image.title="xerodev-mcp"
LABEL org.opencontainers.image.description="MCP server for testing Xero integrations"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.source="https://github.com/ninonline/xerodev-mcp"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="ninonline"
LABEL org.opencontainers.image.documentation="https://github.com/ninonline/xerodev-mcp#readme"
LABEL org.opencontainers.image.authors="ninonline"
