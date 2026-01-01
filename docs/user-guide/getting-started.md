---
title: "Getting Started"
description: "Quick start guide to using xerodev-mcp for Xero integration testing"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["getting-started", "tutorial", "quick-start"]
category: "user-guide"
---

# Getting Started

This guide will help you get started with xerodev-mcp in less than 10 minutes.

## Quick Start (5 Minutes)

If you have Docker installed, you can be up and running immediately:

```bash
# Clone the repository
git clone https://github.com/ninonline/xerodev-mcp.git
cd xerodev-mcp

# Build and start
docker compose up
```

That's it. You now have:
- 3 test tenants (AU/GST, UK/VAT, US)
- 25 MCP tools available
- Realistic test data for development

## Your First Tool Call

Once your AI agent is connected to xerodev-mcp, start with this conversation:

```
Call get_mcp_capabilities to see what's available.
```

The response will show you:
- The current server mode (mock or live)
- Available tenants with their regions
- The recommended AI agent workflow

## Recommended Workflow

xerodev-mcp works best when you follow this workflow:

1. **Discover** - Call `get_mcp_capabilities` to understand the server
2. **Select** - Call `switch_tenant_context` to choose a tenant
3. **Validate** - Call `validate_schema_match` before any write operation
4. **Fix** - Follow `recovery.next_tool_call` if validation fails
5. **Introspect** - Call `introspect_enums` to find valid values
6. **Re-validate** - Call `validate_schema_match` again with the fixed payload
7. **Simulate** - Call `dry_run_sync` to test batch operations (optional)
8. **Execute** - Call the appropriate create tool
9. **Transition** - Use `drive_lifecycle` to move entities through states
10. **Audit** - Use `get_audit_log` to review what happened

## Example: Create Your First Invoice

Let's create a sales invoice for the Australian tenant.

### Step 1: Get Capabilities

```
Call get_mcp_capabilities with verbosity="diagnostic"
```

This returns:
- 3 tenants: acme-au-001 (Australia), company-uk-001 (UK), startup-us-001 (US)
- 25 tools available
- Server is in mock mode (safe for testing)

### Step 2: Switch to Australian Tenant

```
Call switch_tenant_context with tenant_id="acme-au-001"
```

This returns:
- Tenant name: Acme Corporation Pty Ltd
- Region: AU (GST tax system)
- Currency: AUD
- 31 chart of accounts entries
- 20 contacts available

### Step 3: List Available Contacts

```
Call list_contacts with tenant_id="acme-au-001" and page_size=5
```

This returns the first 5 contacts. Let's say we see:
- contact-001: Example Customer
- contact-002: Test Supplier

### Step 4: Validate the Invoice Payload

```
Call validate_schema_match with:
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "payload": {
    "type": "ACCREC",
    "contact_id": "contact-001",
    "line_items": [{
      "description": "Consulting Services",
      "quantity": 10,
      "unit_amount": 150.00,
      "account_code": "200",
      "tax_type": "OUTPUT"
    }]
  }
}
```

If valid, you'll get:
- success: true
- score: 1.0
- "Safe to proceed with creation"

If invalid, you'll get:
- Detailed errors explaining what's wrong
- recovery.next_tool_call showing what to do next

### Step 5: Create the Invoice

```
Call create_invoice with:
{
  "tenant_id": "acme-au-001",
  "type": "ACCREC",
  "contact_id": "contact-001",
  "line_items": [{
    "description": "Consulting Services",
    "quantity": 10,
    "unit_amount": 150.00,
    "account_code": "200",
    "tax_type": "OUTPUT"
  }],
  "status": "DRAFT",
  "idempotency_key": "my-first-invoice-2025-01-01"
}
```

This returns:
- invoice_id: "inv-001"
- Total: $1650.00 (including $150 GST)
- Status: DRAFT

### Step 6: Approve the Invoice

```
Call drive_lifecycle with:
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "entity_id": "inv-001",
  "target_state": "AUTHORISED"
}
```

The invoice is now approved and ready for payment.

## Common Scenarios

### Scenario 1: Invoice Validation Fails

Your invoice validation fails with "AccountCode '999' is ARCHIVED".

**What to do**:

1. Follow the recovery suggestion:
```
Call introspect_enums with:
{
  "tenant_id": "acme-au-001",
  "entity_type": "Account",
  "filter": {
    "type": "REVENUE",
    "status": "ACTIVE"
  }
}
```

2. Choose a valid account code from the response (e.g., "200")

3. Fix your payload and re-validate:
```
Call validate_schema_match with the corrected payload
```

### Scenario 2: Test with Overdue Invoices

Generate overdue invoices for testing debt collection workflows:

```
Call seed_sandbox_data with:
{
  "tenant_id": "acme-au-001",
  "entity": "INVOICES",
  "count": 10,
  "scenario": "OVERDUE_BILLS"
}
```

This returns 10 invoices that are 30-90 days past due.

### Scenario 3: Simulate API Rate Limiting

Test how your integration handles rate limits:

```
Call simulate_network_conditions with:
{
  "tenant_id": "acme-au-001",
  "condition": "RATE_LIMIT",
  "duration_seconds": 60
}
```

All subsequent tool calls will simulate rate limit errors for 60 seconds.

```
Call simulate_network_conditions with duration_seconds=0 to clear
```

## Understanding Response Format

All tools return a consistent response structure:

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
    "suggested_action_id": "find_valid_accounts",
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": { ... }
    }
  }
}
```

**Verbosity levels**:
- `silent`: Just the data
- `compact`: Data + metadata
- `diagnostic`: Full details (recommended for learning)
- `debug`: Everything including SQL queries

## Multi-Region Testing

xerodev-mcp includes three pre-configured tenants for testing multi-region scenarios:

| Tenant | Region | Tax System | Currency |
|--------|--------|------------|----------|
| acme-au-001 | Australia | GST (10%) | AUD |
| company-uk-001 | United Kingdom | VAT (20%) | GBP |
| startup-us-001 | United States | Sales Tax (varies) | USD |

**Test the same invoice across regions**:

```
Call switch_tenant_context to company-uk-001
Call validate_schema_match with the same payload
Note the different TaxTypes (UK uses VAT outputs)
```

## Next Steps

Now that you've created your first invoice:

- **Learn all tools** → [Tools Reference](tools-reference.md)
- **Explore workflows** → [Workflow Guide](workflows.md)
- **Master validation** → [Validation Tutorial](../guides/validating-data.md)
- **Set up live Xero** → [OAuth Setup Guide](../guides/oauth-setup.md)

## I Want To...

- **Install the MCP server** → [Docker Desktop Guide](../installation/docker-desktop.md)
- **See all available tools** → [Tools Reference](tools-reference.md)
- **Learn common workflows** → [Workflow Guide](workflows.md)
- **Configure the server** → [Configuration Reference](../installation/configuration.md)

---

**← Back to:** [User Guide](index.md) | **↑ Up to:** [Documentation Home](../index.md)
