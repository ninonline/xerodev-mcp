---
title: "xerodev-mcp Documentation"
description: "MCP server for testing and validating Xero integrations without live credentials"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["xero", "mcp", "integration-testing"]
category: "documentation"
---

# xerodev-mcp Documentation

An MCP (Model Context Protocol) server for testing and validating Xero integrations without requiring live Xero credentials.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io/)
[![Tests](https://img.shields.io/badge/Tests-481%20Passing-brightgreen.svg)](https://github.com/ninonline/xerodev-mcp)

## Quick Start

```bash
git clone https://github.com/ninonline/xerodev-mcp.git
cd xerodev-mcp
docker compose up
```

In less than a minute you have:
- 3 test tenants (AU/GST, UK/VAT, US)
- 93 chart of accounts entries
- 60 contacts
- 60 invoices, 30 quotes, 24 credit notes
- 30 payments and 45 bank transactions
- 25 tools for validation, simulation, and CRUD operations

## What Is xerodev-mcp?

The [official Xero MCP server](https://github.com/XeroAPI/xero-mcp-server) is designed for AI assistants querying live Xero data. xerodev-mcp is for **developers building integrations** who need to test and validate before touching production.

| Feature | Official MCP | xerodev-mcp |
|---------|--------------|-------------|
| **Testing** | Production only | Sandbox with mock data |
| **Validation** | Fails at runtime | Pre-validates before API calls |
| **Errors** | Generic messages | Educational with recovery suggestions |
| **CI/CD** | Not designed for it | Built for automated testing |

## I Want To...

### Install and Configure

- **Install with Docker Desktop** → [Docker Desktop Guide](installation/docker-desktop.md)
- **Build from source** → [Building from Source](installation/from-source.md)
- **Configure environment variables** → [Configuration Reference](installation/configuration.md)

### Learn and Use

- **Get started quickly** → [Getting Started Guide](user-guide/getting-started.md)
- **See all available tools** → [Tools Reference](user-guide/tools-reference.md)
- **Learn common workflows** → [Workflow Guide](user-guide/workflows.md)
- **Understand mock vs live mode** → [Modes Comparison](user-guide/modes.md)

### Tutorials and Guides

- **Validate an invoice before sending** → [Validation Tutorial](guides/validating-data.md)
- **Test invoice creation** → [Invoice Testing Guide](guides/testing-invoices.md)
- **Set up live Xero OAuth** → [OAuth Setup Guide](guides/oauth-setup.md)
- **Advanced usage patterns** → [Advanced Usage](guides/advanced-usage.md)

### Troubleshoot and Reference

- **Fix common issues** → [Troubleshooting](reference/troubleshooting.md)
- **View API specification** → [MCP API Spec](reference/api-spec.md)
- **Understand error codes** → [Error Reference](reference/error-codes.md)

## Key Features

### Pre-Flight Validation

Validate payloads against your tenant's specific configuration before sending to Xero:

```bash
validate_schema_match({
  tenant_id: "acme-au-001",
  entity_type: "Invoice",
  payload: { ... }
})
```

Returns detailed diffs showing:
- Invalid AccountCodes
- Invalid TaxTypes for your region
- Missing or archived contacts
- Recovery suggestions with next_tool_call

### Educational Errors

Every failure teaches you how to fix it:

```json
{
  "success": false,
  "diagnostics": {
    "narrative": "AccountCode '999' is ARCHIVED. Use introspect_enums to find active accounts."
  },
  "recovery": {
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": {
        "entity_type": "Account",
        "filter": { "status": "ACTIVE" }
      }
    }
  }
}
```

### Sandbox Simulation

Test workflows without risk:

- **dry_run_sync**: Simulate batch operations
- **seed_sandbox_data**: Generate test scenarios
- **drive_lifecycle**: Transition entities through states
- **simulate_network_conditions**: Test resilience

### Multi-Region Support

Three pre-configured tenants with realistic data:

| Tenant | Region | Tax System | Currency |
|--------|--------|------------|----------|
| acme-au-001 | Australia | GST | AUD |
| company-uk-001 | United Kingdom | VAT | GBP |
| startup-us-001 | United States | Sales Tax | USD |

## Tools Overview

### Core Tools (4)

- **get_mcp_capabilities**: Always call first - shows server info and available tenants
- **switch_tenant_context**: Switch between AU/UK/US tenants
- **get_audit_log**: View tool invocation history

### Validation Tools (2)

- **validate_schema_match**: Validate against Xero schema + tenant config
- **introspect_enums**: Get valid AccountCodes, TaxTypes, ContactIDs

### OAuth Tools (5)

- **get_authorization_url**: Start OAuth flow for live Xero
- **exchange_auth_code**: Complete OAuth with callback URL
- **list_connections**: View connected tenants
- **refresh_connection**: Refresh expired OAuth tokens
- **revoke_connection**: Remove a connection

### Simulation Tools (3)

- **dry_run_sync**: Simulate batch operations
- **seed_sandbox_data**: Generate test data
- **drive_lifecycle**: Transition entities through states

### Chaos Tools (2)

- **simulate_network_conditions**: Inject failures (rate limits, timeouts)
- **replay_idempotency**: Test idempotency behaviour

### CRUD Tools (10)

- **create_contact**: Create new contacts
- **create_invoice**: Create sales invoices or bills
- **create_quote**: Create quotes/proposals
- **create_credit_note**: Create credit notes
- **create_payment**: Record payments
- **create_bank_transaction**: Record bank transactions
- **get_contact / get_invoice**: Fetch single entities
- **list_contacts / list_invoices**: List with filters

[→ See full Tools Reference](user-guide/tools-reference.md)

## Recommended Workflow

1. Call **get_mcp_capabilities** to understand the server
2. Call **switch_tenant_context** to select a tenant
3. Call **validate_schema_match** before any write operation
4. If validation fails, follow **recovery.next_tool_call**
5. Call **introspect_enums** to find valid values
6. Fix payload and validate again
7. Call **dry_run_sync** to test batch operations
8. Call the appropriate create tool
9. Use **drive_lifecycle** to transition entities through states
10. Use **get_audit_log** to review operations

## Response Format

All tools return responses with progressive verbosity:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "request_id": "uuid",
    "execution_time_ms": 42,
    "score": 1.0
  },
  "diagnostics": {
    "narrative": "Human-readable explanation",
    "warnings": []
  },
  "recovery": {
    "suggested_action_id": "find_valid_accounts",
    "next_tool_call": { ... }
  }
}
```

Verbosity levels:
- **silent**: Data only
- **compact**: Data + metadata
- **diagnostic**: Full details with narrative
- **debug**: Everything including logs

## Support

- **Issues**: [GitHub Issues](https://github.com/ninonline/xerodev-mcp/issues)
- **Documentation**: [Full Docs](https://github.com/ninonline/xerodev-mcp)
- **License**: [MIT](https://opensource.org/licenses/MIT)

---

**Next**: [Installation Guide](installation/docker-desktop.md) | [Getting Started](user-guide/getting-started.md)
