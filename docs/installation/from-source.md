---
title: "Building from Source"
description: "Guide to build and run xerodev-mcp from source code"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["installation", "source", "development"]
category: "installation"
---

# Building from Source

This guide explains how to build and run xerodev-mcp from source code.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 20.x or higher**
- **npm 9.x or higher** (or yarn/pnpm)
- **Git** for cloning the repository
- (Optional) **SQLite3** for database inspection

### Check Your Versions

```bash
node --version  # Should be v20.x.x or higher
npm --version   # Should be 9.x.x or higher
git --version
```

## Installation Steps

### Step 1: Clone the Repository

```bash
git clone https://github.com/ninonline/xerodev-mcp.git
cd xerodev-mcp
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- Runtime dependencies (`@modelcontextprotocol/sdk`, `xero-node`, `zod`, `better-sqlite3`)
- Development dependencies (`typescript`, `vitest`, `tsx`, `@faker-js/faker`)

### Step 3: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

**Expected output**:
```
src/index.ts → dist/index.js
src/adapters/... → dist/adapters/...
src/core/... → dist/core/...
src/tools/... → dist/tools/...
```

### Step 4: Run Tests (Optional but Recommended)

```bash
npm test
```

All 481 tests should pass.

### Step 5: Start the Server

**Mock mode** (default, no credentials needed):

```bash
npm start
```

**Live mode** (requires Xero credentials):

```bash
MCP_MODE=live \
XERO_CLIENT_ID=your_client_id \
XERO_CLIENT_SECRET=your_secret \
XERO_REDIRECT_URI=http://localhost:3000/callback \
MCP_ENCRYPTION_KEY=$(openssl rand -hex 32) \
npm start
```

## Development Workflow

### Watch Mode

For development with automatic rebuild:

```bash
npm run dev
```

This runs `tsx watch src/index.ts` for hot-reloading.

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Type Checking

```bash
npm run lint
```

This runs TypeScript compiler check without emitting files.

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server mode
MCP_MODE=mock

# Logging
LOG_LEVEL=diagnostic

# Database (optional)
MCP_DATABASE_PATH=./data/xerodev.db
```

### For Live Mode

```bash
# .env file
MCP_MODE=live
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_REDIRECT_URI=http://localhost:3000/callback
MCP_ENCRYPTION_KEY=your_64_char_hex_key
```

See [Configuration Reference](configuration.md) for all options.

## Project Structure

```
xerodev-mcp/
├── src/
│   ├── index.ts                 # Entry point
│   ├── adapters/                # Mock/live adapters
│   ├── core/                    # Security, responses, database
│   └── tools/                   # MCP tool implementations
├── test/
│   ├── fixtures/                # Test data
│   ├── unit/                    # Unit tests
│   └── integration/             # Integration tests
├── dist/                        # Compiled output (generated)
├── docs/                        # Documentation
├── package.json
├── tsconfig.json
└── .env.example
```

## Troubleshooting

### "Cannot find module" Errors

**Cause**: Dependencies not installed or `node_modules` is corrupted.

**Fix**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Build Fails with Type Errors

**Cause**: TypeScript configuration issue or type mismatch.

**Fix**:
```bash
# Check TypeScript version
npx tsc --version

# Clean build
rm -rf dist
npm run build
```

### Tests Fail After Clone

**Cause**: Fixtures not generated or database not initialised.

**Fix**:
```bash
# Generate fixtures
npm run generate:fixtures

# Validate fixtures
npm run validate:fixtures
```

### Port Already in Use (Live Mode)

**Cause**: Redirect URI port is already bound.

**Fix**: Use a different port in `XERO_REDIRECT_URI`:
```bash
XERO_REDIRECT_URI=http://localhost:3001/callback
```

## Verification

### Verify Server Starts

```bash
npm start
```

You should see:
```
[xerodev-mcp] Starting v0.2.0...
[xerodev-mcp] Mode: MOCK
[xerodev-mcp] Ready. Registered 25 tools:
```

### Verify MCP Protocol

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm start
```

Expected response: JSON array of 25 tools.

### Verify Tests Pass

```bash
npm test
```

Expected: `Test Files 28 passed (28), Tests 481 passed (481)`

## Next Steps

Once built and running:

- **Configure your AI agent** to use the local server
- **Read the documentation** in `/docs`
- **Try the examples** in the getting started guide
- **Set up live Xero** if you need real data access

## I Want To...

- **Install with Docker instead** → [Docker Desktop Guide](docker-desktop.md)
- **Configure the server** → [Configuration Reference](configuration.md)
- **Get started quickly** → [Getting Started Guide](../user-guide/getting-started.md)
- **Troubleshoot issues** → [Troubleshooting](../../reference/troubleshooting.md)

---

**← Back to:** [Installation](index.md) | **↑ Up to:** [Documentation Home](../index.md)
