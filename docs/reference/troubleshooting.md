---
title: "Troubleshooting"
description: "Common issues and solutions when using xerodev-mcp"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["troubleshooting", "issues", "faq"]
category: "reference"
---

# Troubleshooting

This page covers common issues and solutions when using xerodev-mcp.

## Installation Issues

### Docker Build Fails

**Symptom**: `docker build` fails with errors.

**Possible causes**:

1. **Docker daemon not running**
   ```bash
   # Check if Docker is running
   docker ps

   # If error: "Cannot connect to the Docker daemon"
   # Start Docker Desktop and try again
   ```

2. **Out of disk space**
   ```bash
   # Check Docker disk usage
   docker system df

   # Clean up unused images
   docker system prune -a
   ```

3. **Network issues during build**
   ```bash
   # Rebuild without cache
   docker build --no-cache -t xerodev-mcp:local .
   ```

### Container Exits Immediately

**Symptom**: Container starts but exits immediately.

**Diagnosis**:
```bash
# Run with interactive terminal to see logs
docker run --rm -it xerodev-mcp:local
```

**Possible fixes**:

1. **Missing dependencies**: Rebuild with `--no-cache`
2. **Port conflicts**: None - MCP uses stdio, not ports
3. **Environment issues**: Check `MCP_MODE` is `mock` or `live`

## MCP Connection Issues

### AI Agent Can't Detect the Server

**Symptom**: Your AI agent says "I don't have access to xerodev-mcp".

**Diagnosis**:
```bash
# Test that MCP server responds
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | docker run --rm -i xerodev-mcp:local
```

**Possible fixes**:

1. **Config file path is wrong** (most common)
   - Use absolute path, not relative
   - Example: `/Users/yourname/path/to/mcp-config.json`
   - NOT: `./mcp-config.json` or `~/mcp-config.json`

2. **JSON syntax error in config**
   ```bash
   # Validate JSON
   cat mcp-config.json | python3 -m json.tool
   ```

3. **Docker image not found**
   ```bash
   # Verify image exists
   docker images | grep xerodev-mcp

   # If missing, build it
   docker build -t xerodev-mcp:local .
   ```

### "stdio connection timeout"

**Symptom**: AI agent reports stdio connection timeout.

**Diagnosis**:
```bash
# Check server starts correctly
docker run --rm -i xerodev-mcp:local 2>&1 | head -10
```

**Expected output**:
```
[xerodev-mcp] Starting v0.1.0...
[xerodev-mcp] Mode: MOCK
[xerodev-mcp] Ready. Registered 25 tools:
```

**Possible fixes**:

1. **Missing `--rm` flag**: Add `--rm` to docker run args
2. **Missing `-i` flag**: Add `-i` for interactive mode
3. **Container crash**: Check stderr logs for startup errors

## Tool Execution Issues

### Tool Returns "Not Found"

**Symptom**: AI agent says a tool doesn't exist.

**Diagnosis**:
```bash
# List all available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | docker run --rm -i xerodev-mcp:local
```

**Expected**: 25 tools listed

**Possible fixes**:

1. **Tool name typo**: Check exact tool name from tools/list
2. **Using old version**: Pull latest code and rebuild
3. **Tool not registered**: Check source code for tool registration

### Validation Always Fails

**Symptom**: `validate_schema_match` always returns errors.

**Possible causes**:

1. **Wrong tenant selected**
   ```
   Call switch_tenant_context first
   Verify you're using the correct tenant_id
   ```

2. **AccountCodes from different tenant**
   ```
   Call introspect_enums to see valid codes for THIS tenant
   Different tenants have different charts of accounts
   ```

3. **TaxTypes don't match region**
   ```
   AU: OUTPUT, INPUT, EXEMPTOUTPUT, EXEMPTINPUT
   UK: A, E, Z, AE, etc.
   US: NONE, TX, etc.
   ```

### "Tenant Not Found"

**Symptom**: `switch_tenant_context` says tenant doesn't exist.

**Diagnosis**:
```
Call get_mcp_capabilities to see available tenants
```

**Possible fixes**:

1. **Typo in tenant_id**: Copy exact tenant_id from capabilities
2. **In mock mode**: Only 3 tenants available (acme-au-001, uk-ltd-001, us-startup-001)
3. **In live mode**: Must complete OAuth first

## OAuth Issues

### "Invalid Client Credentials"

**Symptom**: OAuth flow fails with invalid credentials.

**Diagnosis**:
```bash
# Check environment variables are set
echo $XERO_CLIENT_ID
echo $XERO_CLIENT_SECRET
echo $XERO_REDIRECT_URI
echo $MCP_ENCRYPTION_KEY
```

**Possible fixes**:

1. **Copy credentials from Xero developer portal**
   - Go to [developer.xero.com](https://developer.xero.com)
   - Check your app credentials
   - Ensure scopes are correct

2. **Redirect URI mismatch**
   - The redirect URI in Xero must match exactly
   - Include http:// or https://
   - Include the port number

3. **Encryption key wrong format**
   ```bash
   # Must be exactly 64 hex characters
   # Generate new one:
   openssl rand -hex 32
   ```

### Token Expired Errors

**Symptom**: API calls return 401 unauthorized.

**Diagnosis**:
```
Call list_connections to check token status
```

**Possible fixes**:

1. **Manual refresh**
   ```
   Call refresh_connection with tenant_id
   ```

2. **Re-authorise**
   ```
   Call revoke_connection
   Complete OAuth flow again
   ```

**Note**: Token refresh should happen automatically during normal API calls.

## Performance Issues

### Slow Response Times

**Symptom**: Tools take several seconds to respond.

**Possible causes**:

1. **First call overhead**: First call loads fixtures into memory
2. **Diagnostic verbosity**: Use `compact` for faster responses
3. **Docker performance**: Increase Docker resources

**Fix**:
```bash
# Use compact verbosity for production
{
  "verbosity": "compact"
}

# Allocate more resources to Docker
# Docker Desktop → Settings → Resources → Increase memory
```

### Database Locked Errors

**Symptom**: SQLite "database is locked" errors.

**Possible fixes**:

1. **Ensure single container instance**
   ```bash
   # Stop other instances
   docker ps | grep xerodev-mcp
   docker stop <container-id>
   ```

2. **Use volume for persistence**
   ```yaml
   volumes:
     - xerodev-data:/app/data
   ```

## Validation Errors

### All AccountCodes Invalid

**Symptom**: Every AccountCode you try fails validation.

**Diagnosis**:
```
Call introspect_enums with:
{
  "entity_type": "Account",
  "filter": { "status": "ACTIVE" }
}
```

**Possible fix**:

You may be looking at the wrong tenant's accounts. Each tenant has a different Chart of Accounts.

### Contact Always Not Found

**Symptom**: `validate_schema_match` says contact doesn't exist, even after creating it.

**Diagnosis**:
```
Call list_contacts to see all contacts
```

**Possible fix**:

1. **Wrong tenant**: Ensure you're using the same tenant_id
2. **Case sensitivity**: Contact IDs are case-sensitive
3. **Archived contact**: Check status filter in list_contacts

## Live Mode Issues

### Rate Limit Errors

**Symptom**: API calls return 429 rate limit errors.

**Cause**: Xero limits to 60 requests/minute per tenant.

**Fix**:

1. **Implement exponential backoff**
2. **Batch operations where possible**
3. **Use dry_run_sync to validate batches first**

### "Scope Mismatch"

**Symptom**: OAuth succeeds but API calls fail with scope errors.

**Diagnosis**:
```
Call list_connections and check granted_scopes
```

**Fix**:

1. **Re-authorise with correct scopes**
   ```
   Call get_authorization_url with:
   {
     "scopes": [
       "accounting.transactions",
       "accounting.contacts",
       "offline_access"
     ]
   }
   ```

2. **Complete OAuth flow again**

## Debugging Tips

### Enable Debug Logging

```bash
# Set LOG_LEVEL=debug
environment:
  - LOG_LEVEL=debug
```

This gives you:
- SQL queries
- Internal logs
- Stack traces

### Check Audit Logs

```
Call get_audit_log with:
{
  "tool_name": "the_tool_that_failed",
  "success": false,
  "limit": 10
}
```

### Direct MCP Testing

```bash
# Test any tool directly
echo '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_mcp_capabilities",
    "arguments": {}
  }
}' | docker run --rm -i xerodev-mcp:local
```

### Container Logs

```bash
# View logs from running container
docker logs <container-id>

# Follow logs in real-time
docker logs -f <container-id>
```

## Getting Help

If none of these solutions work:

1. **Check GitHub Issues**: [github.com/ninonline/xerodev-mcp/issues](https://github.com/ninonline/xerodev-mcp/issues)
2. **Create a new issue** with:
   - Your MCP config (redact credentials)
   - The exact error message
   - Steps to reproduce
   - Docker version and platform

3. **Include diagnostic output**:
   ```bash
   docker --version
   docker version
   docker run --rm -i xerodev-mcp:local 2>&1 | head -20
   ```

## I Want To...

- **Install the MCP server** → [Docker Desktop Guide](../installation/docker-desktop.md)
- **Configure the server** → [Configuration Reference](../installation/configuration.md)
- **Learn how to use tools** → [Getting Started Guide](../user-guide/getting-started.md)
- **See common workflows** → [Workflow Guide](../user-guide/workflows.md)

---

**← Back to:** [Reference](index.md) | **↑ Up to:** [Documentation Home](../index.md)
