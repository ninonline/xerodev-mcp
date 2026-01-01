---
title: "Configuration Reference"
description: "Environment variables and configuration options for xerodev-mcp"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["configuration", "environment-variables", "docker"]
category: "installation"
---

# Configuration Reference

This page describes all configuration options for xerodev-mcp, including environment variables and Docker compose options.

## Environment Variables

### Core Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MCP_MODE` | string | `mock` | Server mode: `mock` (uses fixtures) or `live` (connects to Xero) |
| `LOG_LEVEL` | string | `info` | Logging verbosity: `silent`, `compact`, `diagnostic`, `debug` |
| `MCP_DATABASE_PATH` | string | `/app/data/xerodev.db` | SQLite database path for storing state |

### Live Mode Only (Required for MCP_MODE=live)

| Variable | Type | Description |
|----------|------|-------------|
| `XERO_CLIENT_ID` | string | Your Xero app client ID from [developer.xero.com](https://developer.xero.com) |
| `XERO_CLIENT_SECRET` | string | Your Xero app client secret |
| `XERO_REDIRECT_URI` | string | Callback URL for OAuth (e.g., `http://localhost:3000/callback`) |
| `MCP_ENCRYPTION_KEY` | string | 64-character hex string for token encryption |

### Docker Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | string | `production` | Node.js environment |
| `PORT` | number | (none) | Not used - MCP uses stdio transport |

## Configuration Modes

### Mock Mode (Default)

Mock mode uses pre-loaded test fixtures and requires no credentials. This is the recommended mode for development and testing.

```bash
# Set explicitly
export MCP_MODE=mock

# Or in docker-compose.yml
environment:
  - MCP_MODE=mock
```

**What you get in mock mode**:
- 3 pre-configured tenants (AU/GST, UK/VAT, US)
- 60+ contacts per region
- 60 invoices, 30 quotes, 24 credit notes
- 30 payments and 45 bank transactions
- Unlimited API calls (no rate limits)

### Live Mode

Live mode connects to real Xero organisations using OAuth 2.0. Requires Xero app credentials.

```bash
# Set mode to live
export MCP_MODE=live
export XERO_CLIENT_ID=your_client_id
export XERO_CLIENT_SECRET=your_secret
export XERO_REDIRECT_URI=http://localhost:3000/callback
export MCP_ENCRYPTION_KEY=your_64_char_hex_key
```

**Generating an encryption key**:

```bash
openssl rand -hex 32
```

**Live mode considerations**:
- Real Xero API calls with rate limits (60 requests/minute)
- Requires OAuth setup (see [OAuth Setup Guide](../guides/oauth-setup.md))
- Changes affect real Xero data
- Token refresh is automatic

## Verbosity Levels

The `LOG_LEVEL` variable controls how much information is returned in tool responses.

| Level | Description | Use Case |
|-------|-------------|----------|
| `silent` | Data only | Programmatic parsing, minimal output |
| `compact` | Data + metadata | Normal operations, includes timestamps |
| `diagnostic` | Full details with narrative | Debugging, understanding what happened |
| `debug` | Everything including logs | Deep troubleshooting, development |

**Example responses by verbosity**:

```json
// silent
{
  "success": true,
  "data": { "invoice_id": "inv-001" }
}

// compact
{
  "success": true,
  "data": { "invoice_id": "inv-001" },
  "meta": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "request_id": "abc-123",
    "execution_time_ms": 42
  }
}

// diagnostic
{
  "success": true,
  "data": { "invoice_id": "inv-001" },
  "meta": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "request_id": "abc-123",
    "execution_time_ms": 42,
    "score": 1.0
  },
  "diagnostics": {
    "narrative": "Invoice created successfully for tenant acme-au-001.",
    "warnings": []
  }
}

// debug
{
  "success": true,
  "data": { "invoice_id": "inv-001" },
  "meta": { ... },
  "diagnostics": { ... },
  "debug": {
    "logs": ["Loading tenant config", "Validating payload", "Creating invoice"],
    "sql_queries": ["SELECT * FROM tenants WHERE tenant_id = ?", "INSERT INTO audit_log ..."]
  }
}
```

## Docker Compose Configuration

### Default (Mock Mode)

The default `docker-compose.yml` runs in mock mode:

```yaml
version: '3.8'

services:
  xerodev-mcp:
    image: xerodev-mcp:latest
    build: .
    environment:
      - MCP_MODE=mock
      - LOG_LEVEL=diagnostic
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=10m
```

### Live Mode Override

Create `docker-compose.live.yml`:

```yaml
version: '3.8'

services:
  xerodev-mcp:
    environment:
      - MCP_MODE=live
      - XERO_CLIENT_ID=${XERO_CLIENT_ID}
      - XERO_CLIENT_SECRET=${XERO_CLIENT_SECRET}
      - XERO_REDIRECT_URI=${XERO_REDIRECT_URI}
      - MCP_ENCRYPTION_KEY=${MCP_ENCRYPTION_KEY}
    volumes:
      - xerodev-data:/app/data

volumes:
  xerodev-data:
```

**Run with live override**:

```bash
docker compose -f docker-compose.yml -f docker-compose.live.yml up
```

### Development Mode

For hot-reload during development, use `docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  xerodev-mcp:
    volumes:
      - ./src:/app/src:ro
      - ./test/fixtures:/app/test/fixtures:ro
    command: npm run dev
```

## MCP Configuration Files

### For Claude Code

```json
{
  "mcpServers": {
    "xerodev-mcp": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--init",
        "-e", "MCP_MODE=mock",
        "-e", "LOG_LEVEL=diagnostic",
        "xerodev-mcp:latest"
      ]
    }
  }
}
```

### For Continue.dev

```json
{
  "mcpServers": {
    "xerodev-mcp": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--init",
        "-e",
        "MCP_MODE=mock",
        "-e",
        "LOG_LEVEL=diagnostic",
        "xerodev-mcp:latest"
      ]
    }
  }
}
```

### For Cursor IDE

Settings → MCP Servers → Add Custom Server:
- **Name**: `xerodev-mcp`
- **Command**: `docker`
- **Args**: `run,--rm,-i,--init,-e,MCP_MODE=mock,-e,LOG_LEVEL=diagnostic,xerodev-mcp:latest`

## Database Configuration

### SQLite Database Path

The default database path is `/app/data/xerodev.db` inside the container.

**For mock mode**: Stores cached fixture data and audit logs.

**For live mode**: Stores OAuth tokens, tenant connections, and audit logs.

### Persisting Data

Use a Docker volume to persist data across container restarts:

```yaml
version: '3.8'

services:
  xerodev-mcp:
    volumes:
      - xerodev-data:/app/data

volumes:
  xerodev-data:
```

### Database Schema

The SQLite database contains these tables:

| Table | Purpose |
|-------|---------|
| `tenants` | OAuth tokens and connection status (live mode) |
| `shadow_state` | Cached Xero data for validation |
| `audit_log` | Tool invocation history |

See [API Specification](../reference/api-spec.md) for full schema details.

## Security Configuration

### Encryption Key (Live Mode)

The `MCP_ENCRYPTION_KEY` is required for live mode to encrypt OAuth tokens in the database.

**Generate a secure key**:

```bash
openssl rand -hex 32
```

**Store in `.env` file** (never commit this):

```bash
MCP_ENCRYPTION_KEY=abcd1234...64_characters...ef567890
```

### Docker Security Options

The default `docker-compose.yml` includes these security options:

```yaml
security_opt:
  - no-new-privileges:true
read_only: true
tmpfs:
  - /tmp:rw,noexec,nosuid,size=10m
```

**What these do**:
- `no-new-privileges`: Prevents privilege escalation
- `read_only`: Container filesystem is read-only (except /tmp)
- `tmpfs`: `/tmp` is mounted in memory with noexec flag

### OAuth Scopes (Live Mode)

When calling `get_authorization_url`, you can specify which OAuth scopes to request:

| Scope | Description |
|-------|-------------|
| `accounting.transactions` | Create, read, update invoices, quotes, credit notes |
| `accounting.contacts` | Create and read contacts |
| `accounting.settings` | Read organisation settings |
| `accounting.reports.read` | Read financial reports |
| `accounting.journals.read` | Read journal entries |
| `offline_access` | Required for refresh tokens |

**Default scopes** (recommended for most use cases):

```json
{
  "scopes": [
    "accounting.transactions",
    "accounting.contacts",
    "accounting.settings",
    "offline_access"
  ]
}
```

## Common Configuration Patterns

### Local Development (Mock)

```bash
# docker-compose.yml
environment:
  - MCP_MODE=mock
  - LOG_LEVEL=debug
```

### Testing (Mock with Diagnostic Logs)

```bash
environment:
  - MCP_MODE=mock
  - LOG_LEVEL=diagnostic
```

### CI/CD (Mock with Silent Logs)

```bash
environment:
  - MCP_MODE=mock
  - LOG_LEVEL=silent
```

### Production (Live with Encryption)

```bash
# .env file
MCP_MODE=live
XERO_CLIENT_ID=${XERO_CLIENT_ID}
XERO_CLIENT_SECRET=${XERO_CLIENT_SECRET}
XERO_REDIRECT_URI=https://your-domain.com/callback
MCP_ENCRYPTION_KEY=${MCP_ENCRYPTION_KEY}
LOG_LEVEL=compact
```

## I Want To...

- **Install with Docker Desktop** → [Docker Desktop Guide](docker-desktop.md)
- **Set up live Xero connection** → [OAuth Setup Guide](../guides/oauth-setup.md)
- **Troubleshoot configuration issues** → [Troubleshooting](../../reference/troubleshooting.md)

---

**← Back to:** [Installation](index.md) | **↑ Up to:** [Documentation Home](../index.md)
