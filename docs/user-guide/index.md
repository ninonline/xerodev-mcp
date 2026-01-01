---
title: "User Guide"
description: "User documentation for xerodev-mcp"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["user-guide"]
category: "user-guide"
---

# User Guide

This section contains user documentation for xerodev-mcp.

## Getting Started

New to xerodev-mcp? Start here.

[→ Getting Started Guide](getting-started.md)

**Covers**:
- Quick start in 5 minutes
- Your first tool call
- Recommended workflow
- Example: Create your first invoice

## Tools Reference

Complete documentation for all 25 tools.

[→ Tools Reference](tools-reference.md)

**Organised by category**:
- Core Tools (4)
- Validation Tools (2)
- OAuth Tools (5)
- Simulation Tools (3)
- Chaos Tools (2)
- CRUD Tools (10)

## Common Workflows

Task-based guides for common scenarios.

[→ Workflow Guide](workflows.md)

**Includes**:
- Validate an invoice before sending
- Test without live data
- Simulate API failures
- Connect to live Xero
- Create batch invoices
- And more...

## Key Concepts

### Mock Mode vs Live Mode

**Mock Mode** (default):
- Uses pre-loaded test fixtures
- No Xero credentials required
- Safe for development and testing
- 3 pre-configured tenants

**Live Mode**:
- Connects to real Xero organisations
- Requires OAuth setup
- Affects real Xero data
- Automatic token refresh

### Validation Workflow

The recommended workflow for all operations:

1. **Discover**: Call `get_mcp_capabilities`
2. **Select**: Call `switch_tenant_context`
3. **Validate**: Call `validate_schema_match`
4. **Fix**: Follow recovery suggestions if needed
5. **Introspect**: Call `introspect_enums` to find valid values
6. **Re-validate**: Validate again with fixed payload
7. **Execute**: Call the appropriate create tool

### Response Format

All tools return a consistent structure:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "request_id": "abc-123",
    "execution_time_ms": 42,
    "score": 1.0
  },
  "diagnostics": {
    "narrative": "Human-readable explanation",
    "warnings": []
  },
  "recovery": {
    "next_tool_call": { ... }
  }
}
```

## I Want To...

- **Install the MCP server** → [Docker Desktop Guide](../installation/docker-desktop.md)
- **Configure the server** → [Configuration Reference](../installation/configuration.md)
- **Validate data before sending** → [Validation Tutorial](../guides/validating-data.md)
- **Set up live Xero** → [OAuth Setup Guide](../guides/oauth-setup.md)

---

**↑ Up to:** [Documentation Home](../index.md)
