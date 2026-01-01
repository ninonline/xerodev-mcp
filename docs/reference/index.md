---
title: "Reference"
description: "Technical reference documentation for xerodev-mcp"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["reference"]
category: "reference"
---

# Reference

This section contains technical reference documentation for xerodev-mcp.

## Troubleshooting

Common issues and solutions when using xerodev-mcp.

[→ Troubleshooting](troubleshooting.md)

**Covers**:
- Installation issues
- MCP connection problems
- Tool execution errors
- OAuth issues
- Performance problems
- Debugging tips

## Additional Reference

More reference documentation will be added here as the project grows:

- API Specification (coming soon)
- Error Codes Reference (coming soon)
- Database Schema (coming soon)

## Quick Help

### Quick Diagnosis

Test that the server is working:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run --rm -i xerodev-mcp:local
```

Expected: JSON array of 25 tools.

### Check Server Capabilities

```
Call get_mcp_capabilities to see server status
```

### View Audit Logs

```
Call get_audit_log to see recent tool calls
```

## I Want To...

- **Get started quickly** → [Getting Started Guide](../user-guide/getting-started.md)
- **Install the MCP server** → [Docker Desktop Guide](../installation/docker-desktop.md)
- **See all tools** → [Tools Reference](../user-guide/tools-reference.md)
- **Learn workflows** → [Workflow Guide](../user-guide/workflows.md)

---

**↑ Up to:** [Documentation Home](../index.md)
