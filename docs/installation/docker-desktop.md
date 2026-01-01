---
title: "Installing xerodev-mcp with Docker Desktop"
description: "Step-by-step guide to install and configure the xerodev-mcp server using Docker Desktop"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["installation", "docker", "docker-desktop"]
category: "installation"
---

# Installing xerodev-mcp with Docker Desktop

This guide will walk you through installing the xerodev-mcp server using Docker Desktop, the recommended method for most users.

## Prerequisites

Before you begin, ensure you have:

- **Docker Desktop 4.30 or later** installed and running
- An AI coding agent that supports MCP:
  - [Claude Code](https://claude.ai/code) (CLI)
  - [Continue.dev](https://continue.dev)
  - [Cursor IDE](https://cursor.sh)
  - Other MCP-compatible AI tools
- At least 2GB available memory for Docker

### Check Docker is Running

```bash
docker ps
```

If this command runs without error, Docker is ready.

## Installation Steps

### Step 1: Clone the Repository

```bash
git clone https://github.com/ninonline/xerodev-mcp.git
cd xerodev-mcp
```

### Step 2: Build the Docker Image

Build the image locally from the cloned repository:

```bash
docker build -t xerodev-mcp:local .
```

Expected build time: 1-2 minutes on first run (subsequent builds are faster).

**Verify the image built successfully:**

```bash
docker images | grep xerodev-mcp
```

You should see `xerodev-mcp` in the list.

### Step 3: Verify the Server Works

Test that the MCP server responds correctly:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | docker run --rm -i xerodev-mcp:local
```

Expected response: JSON array listing 25 tools.

### Step 4: Create MCP Configuration

Create a file named `mcp-config.json` in your preferred location:

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
        "xerodev-mcp:local"
      ]
    }
  }
}
```

**Note the absolute path** - you'll need it in the next step.

## Configure Your AI Agent

### For Claude Code

**Option 1: Command-line flag**

```bash
claude --mcp-config /absolute/path/to/mcp-config.json
```

**Option 2: Environment variable**

```bash
export CLAUDE_MCP_CONFIG=/absolute/path/to/mcp-config.json
claude
```

### For Continue.dev

Add to your `~/.continue/config.json`:

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
        "xerodev-mcp:local"
      ]
    }
  }
}
```

### For Cursor IDE

1. Open **Settings** → **MCP Servers**
2. Click **Add Custom Server**
3. Configure:
   - **Name**: `xerodev-mcp`
   - **Command**: `docker`
   - **Args**: `run,--rm,-i,--init,-e,MCP_MODE=mock,-e,LOG_LEVEL=diagnostic,xerodev-mcp:local`

### For JetBrains IDEs (via plugin)

1. Go to **Settings** → **Tools** → **MCP Servers**
2. Click **Add**
3. Configure:
   - **Name**: `xerodev-mcp`
   - **Type**: Docker
   - **Image**: `xerodev-mcp:local`
   - **Environment Variables**:
     - `MCP_MODE=mock`
     - `LOG_LEVEL=diagnostic`

### For Zed Editor

Add to `settings.json`:

```json
{
  "lsp": {
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
        "xerodev-mcp:local"
      ],
      "transport": "stdio"
    }
  }
}
```

## Test the Installation

Start a conversation with your AI agent and ask:

```
Call get_mcp_capabilities to see what tools are available.
```

Expected response should show:
- Server name: "xerodev-mcp"
- 25 tools available
- 3 tenants (AU, UK, US)

## Quick Test Workflow

Once connected, try this simple workflow:

```
1. Call get_mcp_capabilities to see available tenants
2. Call switch_tenant_context to select acme-au-001
3. Call list_contacts to see available contacts
4. Call validate_schema_match with this invoice payload:
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "payload": {
    "type": "ACCREC",
    "contact_id": "contact-001",
    "line_items": [{
      "description": "Test Service",
      "quantity": 1,
      "unit_amount": 100,
      "account_code": "200",
      "tax_type": "OUTPUT"
    }]
  }
}
```

## Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `MCP_MODE` | `mock` (default) or `live` | Mock uses fixtures, live connects to Xero |
| `LOG_LEVEL` | `silent`, `compact`, `diagnostic`, `debug` | Verbosity of responses |
| `MCP_DATABASE_PATH` | `/app/data/xerodev.db` (default) | SQLite database path |

### For Live Mode (requires Xero credentials)

```bash
docker run --rm -i \
  -e MCP_MODE=live \
  -e XERO_CLIENT_ID=your_client_id \
  -e XERO_CLIENT_SECRET=your_secret \
  -e XERO_REDIRECT_URI=http://localhost:3000/callback \
  -e MCP_ENCRYPTION_KEY=your_64_char_hex_key \
  xerodev-mcp:local
```

See [Live Mode Setup](../guides/oauth-setup.md) for detailed OAuth configuration.

## Troubleshooting

### "docker run failed"

**Cause**: Docker daemon not running or image not built

**Fix**:
```bash
# Check Docker is running
docker ps

# Rebuild image
docker build -t xerodev-mcp:local .
```

### "stdio connection timeout"

**Cause**: Container exited immediately

**Fix**:
```bash
# Run interactively to see logs
docker run --rm -it xerodev-mcp:local

# Check for startup errors in logs
```

### "Tools not found"

**Cause**: MCP server didn't start correctly

**Fix**:
```bash
# Verify server starts
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run --rm -i xerodev-mcp:local
```

Expected response: JSON array of 25 tools

### "Module not found" errors

**Cause**: Node modules not in image

**Fix**:
```bash
# Rebuild with no cache
docker build --no-cache -t xerodev-mcp:local .
```

### Claude Code can't detect the server

**Cause**: MCP config path is relative instead of absolute

**Fix**: Use the absolute path to your config file:
```bash
claude --mcp-config /Users/yourname/path/to/mcp-config.json
```

### Container runs but AI agent doesn't see tools

**Cause**: Various - check stderr output

**Fix**:
```bash
# Run with verbose stderr to see startup logs
docker run --rm -i xerodev-mcp:local 2>&1 | head -20
```

You should see:
```
[xerodev-mcp] Starting v0.1.0...
[xerodev-mcp] Mode: MOCK
[xerodev-mcp] Ready. Registered 25 tools:
```

## Verification Checklist

Before testing in a real project:

- [ ] Docker Desktop is running
- [ ] Docker image builds successfully: `docker build -t xerodev-mcp:local .`
- [ ] Server responds to tools/list
- [ ] AI agent is configured with MCP config
- [ ] get_mcp_capabilities returns 25 tools
- [ ] Can switch between tenants
- [ ] Can validate schemas

## I Want To...

- **Build from source instead of Docker** → [Building from Source](from-source.md)
- **Configure environment variables** → [Configuration Guide](configuration.md)
- **Set up live Xero connection** → [OAuth Setup Guide](../guides/oauth-setup.md)
- **Troubleshoot other issues** → [Troubleshooting](../../reference/troubleshooting.md)

---

**← Back to:** [Installation](index.md) | **↑ Up to:** [Documentation Home](../index.md)
