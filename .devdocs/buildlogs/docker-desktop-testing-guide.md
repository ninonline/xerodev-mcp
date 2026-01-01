# Testing xerodev-mcp with Docker Desktop

This guide explains how to test the xerodev-mcp server in a real development project using Docker Desktop's MCP Toolkit.

---

## Prerequisites

1. **Docker Desktop** (latest version) with MCP Toolkit enabled
   - Go to Settings → Features in development
   - Enable "MCP Toolkit" (if available in your version)

2. **An AI coding agent** that supports MCP:
   - Claude Code (CLI)
   - Continue.dev
   - Cursor IDE
   - Other MCP-compatible AI tools

---

## Option 1: Build from Source (Recommended for Development)

This builds the image locally from your cloned repository.

### Step 1: Build the Docker Image

```bash
cd /path/to/xerodev-mcp
docker build -t xerodev-mcp:local .
```

### Step 2: Create MCP Configuration File

Create a file named `mcp-config.json` somewhere accessible:

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

### Step 3: Configure Your AI Agent

**For Claude Code:**
```bash
# Set the MCP config path
export CLAUDE_MCP_CONFIG=/path/to/mcp-config.json

# Or pass it directly
claude --mcp-config /path/to/mcp-config.json
```

**For Continue.dev:**
Add to your `~/.continue/config.json`:
```json
{
  "mcpServers": {
    "xerodev-mcp": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--init", "-e", "MCP_MODE=mock", "xerodev-mcp:local"]
    }
  }
}
```

**For Cursor IDE:**
Settings → MCP Servers → Add Custom Server:
- Name: `xerodev-mcp`
- Command: `docker`
- Args: `run,--rm,-i,--init,-e,MCP_MODE=mock,xerodev-mcp:local`

---

## Option 2: Pull from Docker Hub (When Published)

Once published to Docker Hub's `mcp/` namespace:

```bash
docker pull mcp/xerodev-mcp:latest
```

Then use `mcp/xerodev-mcp:latest` in your MCP configuration instead of `xerodev-mcp:local`.

---

## Option 3: Docker Desktop MCP Catalog (After Registry Submission)

Once approved in the Docker MCP Registry:

1. Open Docker Desktop
2. Go to **MCP Toolkit** (or **Features → MCP Servers**)
3. Click **Browse Catalog**
4. Search for "xerodev-mcp" or "Xero"
5. Click **Add** and configure:
   - **Mode:** `mock` (for testing) or `live` (for real Xero)
   - **Log Level:** `diagnostic` (recommended for development)

---

## Testing the MCP Server

### Quick Verification Test

Start a conversation with your AI agent and ask:

```
Call get_mcp_capabilities to see what tools are available.
```

Expected response should show:
- Server name: "xerodev-mcp"
- 25 tools available
- 3 tenants (AU, UK, US)

### Test Workflow 1: Validate an Invoice

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
    "contact": {"contact_id": "contact-001"},
    "lineItems": [{
      "description": "Test Service",
      "quantity": 1,
      "unitAmount": 100,
      "accountCode": "200",
      "taxType": "OUTPUT"
    }]
  }
}
```

### Test Workflow 2: Explore with Errors

```
1. Call validate_schema_match with an INTENTIONAL error:
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "payload": {
    "lineItems": [{"accountCode": "999"}]  // Archived account
  }
}

2. The response should include recovery.next_tool_call

3. Follow the recovery suggestion to introspect_enums
```

---

## Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `MCP_MODE` | `mock` (default) or `live` | Mock uses fixtures, live connects to Xero |
| `LOG_LEVEL` | `silent`, `compact`, `diagnostic`, `debug` | Verbosity of responses |
| `MCP_DATABASE_PATH` | `/app/data/xerodev.db` (default) | SQLite database path |

**For Live Mode** (requires Xero credentials):
```bash
docker run --rm -i \
  -e MCP_MODE=live \
  -e XERO_CLIENT_ID=your_client_id \
  -e XERO_CLIENT_SECRET=your_secret \
  -e XERO_REDIRECT_URI=http://localhost:3000/callback \
  -e MCP_ENCRYPTION_KEY=your_64_char_hex_key \
  xerodev-mcp:local
```

---

## Troubleshooting

### "docker run failed"

**Cause:** Docker daemon not running or image not built

**Fix:**
```bash
# Check Docker is running
docker ps

# Rebuild image
docker build -t xerodev-mcp:local .
```

### "stdio connection timeout"

**Cause:** Container exited immediately

**Fix:**
```bash
# Run interactively to see logs
docker run --rm -it xerodev-mcp:local

# Check for startup errors in logs
```

### "Tools not found"

**Cause:** MCP server didn't start correctly

**Fix:**
```bash
# Verify server starts
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run --rm -i xerodev-mcp:local
```

Expected response: JSON array of 25 tools

### "Module not found" errors

**Cause:** Node modules not in image

**Fix:**
```bash
# Rebuild with --no-cache
docker build --no-cache -t xerodev-mcp:local .
```

---

## Verification Checklist

Before testing in a real project:

- [ ] Docker Desktop is running
- [ ] Docker image builds successfully: `docker build -t xerodev-mcp:local .`
- [ ] Server responds to tools/list: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | docker run --rm -i xerodev-mcp:local`
- [ ] AI agent is configured with MCP config
- [ ] get_mcp_capabilities returns 25 tools
- [ ] Can switch between tenants
- [ ] Can validate schemas

---

## Next Steps

Once verified working:

1. **Test in a real Xero integration project**
   - Use validate_schema_match before creating invoices
   - Use dry_run_sync to test batch operations
   - Use seed_sandbox_data to generate test scenarios

2. **Provide feedback**
   - Report issues on GitHub
   - Suggest improvements
   - Share your testing experience

3. **Prepare for production**
   - Complete OAuth flow for live Xero access
   - Configure security settings
   - Set up monitoring

---

## Appendix: Example MCP Configuration for Popular IDEs

### VS Code + Continue.dev

Create `~/.continue/config.json`:

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
        "xerodev-mcp:local"
      ]
    }
  },
  "contextProviders": [
    {
      "name": "xerodev-mcp",
      "context": {
        "description": "Xero integration testing tools"
      }
    }
  ]
}
```

### JetBrains IDEs (via plugin)

Settings → Tools → MCP Servers → Add:
- **Name:** `xerodev-mcp`
- **Type:** Docker
- **Image:** `xerodev-mcp:local`
- **Environment Variables:**
  - `MCP_MODE=mock`
  - `LOG_LEVEL=diagnostic`

### Zed Editor

Add to `settings.json`:

```json
{
  "lsp": {
    "xerodev-mcp": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--init", "-e", "MCP_MODE=mock", "xerodev-mcp:local"],
      "transport": "stdio"
    }
  }
}
```
