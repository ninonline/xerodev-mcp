# xerodev-mcp

An MCP (Model Context Protocol) server for testing and validating Xero integrations without requiring live Xero credentials.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io/)

## Quick Start

```bash
# Clone and start with Docker
git clone https://github.com/xerodev/xerodev-mcp.git
cd xerodev-mcp
docker compose up
```

**That's it.** No Xero credentials needed. You now have:

- 1 Australian test tenant with GST tax system
- 31 Chart of Accounts entries
- 20 contacts (customers and suppliers)
- 20 invoices, 10 quotes, 8 credit notes
- 10 payments and 15 bank transactions
- 16 tools for validation, simulation, and CRUD operations

## Overview

The [official Xero MCP server](https://github.com/XeroAPI/xero-mcp-server) is designed for AI assistants querying live Xero data. xerodev-mcp is for **developers building integrations** who need to test and validate before touching production.

| Feature | Official MCP | xerodev-mcp |
|---------|--------------|-------------|
| **Testing** | Production only | Sandbox with mock data |
| **Validation** | Fails at runtime | Pre-validates before API calls |
| **Errors** | Generic messages | Educational with recovery suggestions |
| **CI/CD** | Not designed for it | Built for automated testing |

## Available Tools

### Core Tools

#### get_mcp_capabilities

Returns server capabilities and workflow guidelines. **Always call this first.**

```json
{
  "include_tenants": true,
  "verbosity": "diagnostic"
}
```

#### switch_tenant_context

Switch to a specific tenant and load its configuration.

```json
{
  "tenant_id": "acme-au-001",
  "verbosity": "diagnostic"
}
```

#### get_audit_log

Retrieve audit log entries for debugging and compliance.

```json
{
  "tenant_id": "acme-au-001",
  "tool_name": "create_invoice",
  "success": true,
  "include_stats": true,
  "limit": 20,
  "verbosity": "diagnostic"
}
```

### Validation Tools

#### validate_schema_match

Validates payloads against the tenant's configuration. Returns educational errors with recovery suggestions.

```json
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "payload": {
    "type": "ACCREC",
    "contact": { "contact_id": "contact-001" },
    "line_items": [{
      "description": "Consulting Services",
      "quantity": 10,
      "unit_amount": 150.00,
      "account_code": "200",
      "tax_type": "OUTPUT"
    }]
  },
  "verbosity": "diagnostic"
}
```

Supported entity types: `Invoice`, `Contact`, `Quote`, `CreditNote`, `Payment`, `BankTransaction`

When validation fails, the response includes:

- Detailed diff showing what's wrong
- Compliance score (0.0 to 1.0)
- Recovery suggestions with `next_tool_call`

#### introspect_enums

Get valid values for AccountCodes, TaxTypes, or ContactIDs.

```json
{
  "tenant_id": "acme-au-001",
  "entity_type": "Account",
  "filter": { "type": "REVENUE", "status": "ACTIVE" },
  "verbosity": "compact"
}
```

### Simulation Tools

#### dry_run_sync

Simulate batch operations without executing them.

```json
{
  "tenant_id": "acme-au-001",
  "operation": "create_invoices",
  "payloads": [...],
  "verbosity": "diagnostic"
}
```

Returns: number that would succeed/fail, estimated total amount, issues summary, recovery suggestions.

#### seed_sandbox_data

Generate realistic test data for various scenarios.

```json
{
  "tenant_id": "acme-au-001",
  "entity": "INVOICES",
  "count": 10,
  "scenario": "OVERDUE_BILLS",
  "verbosity": "diagnostic"
}
```

Scenarios: `DEFAULT`, `OVERDUE_BILLS`, `MIXED_STATUS`, `HIGH_VALUE`

#### drive_lifecycle

Transitions an entity through its lifecycle states.

```json
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "entity_id": "inv-001",
  "target_state": "AUTHORISED",
  "verbosity": "diagnostic"
}
```

**Invoice states:** DRAFT → SUBMITTED → AUTHORISED → PAID (terminal). Any state → VOIDED (except PAID).

**Quote states:** DRAFT → SENT → ACCEPTED → INVOICED (terminal). DECLINED → DRAFT for re-editing.

**Credit note states:** Same as invoices.

For PAID transitions, include `payment_amount` and `payment_account_id`.

### Chaos Tools

#### simulate_network_conditions

Test how your integration handles network failures.

```json
{
  "tenant_id": "acme-au-001",
  "condition": "RATE_LIMIT",
  "duration_seconds": 60,
  "verbosity": "diagnostic"
}
```

Conditions:

- `RATE_LIMIT` - Simulates Xero's 60 req/min limit (429)
- `TIMEOUT` - Simulates slow/hanging connections
- `SERVER_ERROR` - Simulates 500/502/503 errors
- `TOKEN_EXPIRED` - Simulates OAuth expiration (401)
- `INTERMITTENT` - Random failures at specified rate

#### replay_idempotency

Test idempotency key behaviour.

```json
{
  "tenant_id": "acme-au-001",
  "operation": "create_invoice",
  "idempotency_key": "my-unique-key",
  "payload": { ... },
  "replay_count": 5,
  "verbosity": "diagnostic"
}
```

### CRUD Tools

#### create_contact

Create a new contact in the tenant.

```json
{
  "tenant_id": "acme-au-001",
  "name": "Example Customer",
  "email": "customer@example.com",
  "is_customer": true,
  "is_supplier": false,
  "idempotency_key": "unique-key",
  "verbosity": "diagnostic"
}
```

#### create_invoice

Create a new invoice in the tenant.

```json
{
  "tenant_id": "acme-au-001",
  "type": "ACCREC",
  "contact_id": "contact-001",
  "line_items": [{
    "description": "Consulting",
    "quantity": 10,
    "unit_amount": 150.00,
    "account_code": "200",
    "tax_type": "OUTPUT"
  }],
  "status": "DRAFT",
  "idempotency_key": "unique-key",
  "verbosity": "diagnostic"
}
```

Invoice types: `ACCREC` (sales invoice), `ACCPAY` (bill from supplier).

#### create_quote

Create a new quote/proposal.

```json
{
  "tenant_id": "acme-au-001",
  "contact_id": "contact-001",
  "line_items": [{
    "description": "Consulting Services",
    "quantity": 10,
    "unit_amount": 150.00,
    "account_code": "200"
  }],
  "title": "Project Proposal",
  "expiry_date": "2025-02-28",
  "idempotency_key": "unique-key",
  "verbosity": "diagnostic"
}
```

#### create_credit_note

Create a new credit note.

```json
{
  "tenant_id": "acme-au-001",
  "type": "ACCRECCREDIT",
  "contact_id": "contact-001",
  "line_items": [{
    "description": "Refund for returned items",
    "quantity": 1,
    "unit_amount": 100.00,
    "account_code": "200"
  }],
  "idempotency_key": "unique-key",
  "verbosity": "diagnostic"
}
```

Credit note types: `ACCRECCREDIT` (credit to customer), `ACCPAYCREDIT` (credit from supplier).

#### create_payment

Create a new payment against an invoice or credit note.

```json
{
  "tenant_id": "acme-au-001",
  "invoice_id": "inv-001",
  "account_id": "acc-027",
  "amount": 1650.00,
  "date": "2025-01-15",
  "idempotency_key": "unique-key",
  "verbosity": "diagnostic"
}
```

#### create_bank_transaction

Create a new bank transaction (receive or spend).

```json
{
  "tenant_id": "acme-au-001",
  "type": "RECEIVE",
  "bank_account_id": "acc-027",
  "contact_id": "contact-001",
  "line_items": [{
    "description": "Payment received",
    "quantity": 1,
    "unit_amount": 500.00,
    "account_code": "200"
  }],
  "idempotency_key": "unique-key",
  "verbosity": "diagnostic"
}
```

Transaction types: `RECEIVE`, `SPEND`, `RECEIVE-OVERPAYMENT`, `RECEIVE-PREPAYMENT`, `SPEND-OVERPAYMENT`, `SPEND-PREPAYMENT`.

## AI Agent Workflow

The recommended workflow for AI agents:

1. Call `get_mcp_capabilities` to understand the server
2. Call `switch_tenant_context` to select a tenant
3. Call `validate_schema_match` before any write operation
4. If validation fails, follow `recovery.next_tool_call`
5. Call `introspect_enums` to find valid values
6. Fix payload and validate again
7. Call `dry_run_sync` to test batch operations
8. Call the appropriate create tool
9. Use `drive_lifecycle` to transition entities through states
10. Use `get_audit_log` to review operations

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
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": { ... }
    }
  }
}
```

Verbosity levels:

- `silent` - Data only
- `compact` - Data + metadata
- `diagnostic` - Full details with narrative
- `debug` - Everything including logs

## Installation

### Docker (recommended)

```bash
# Production mode (mock data)
git clone https://github.com/xerodev/xerodev-mcp.git
cd xerodev-mcp
docker compose up

# Development mode with hot-reload
docker compose -f docker-compose.dev.yml up

# Live Xero mode (requires credentials)
docker compose -f docker-compose.yml -f docker-compose.live.yml up
```

### Local Development

```bash
npm install
npm run build
npm test
npm start
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_MODE` | `mock` | Server mode (`mock` or `live`) |
| `MCP_DATABASE_PATH` | `./data/xerodev.db` | SQLite database path |
| `MCP_ENCRYPTION_KEY` | - | 64-char hex for token encryption (live mode) |
| `LOG_LEVEL` | `info` | Logging level |

For live mode, copy `.env.example` to `.env` and configure your Xero OAuth credentials.

## Test Fixtures

The server includes realistic Australian test data:

- **Tenant**: Acme Corporation Pty Ltd (AU)
- **Accounts**: 31 entries (Chart of Accounts with GST)
- **Contacts**: 20 contacts (customers and suppliers)
- **Invoices**: 20 sample invoices
- **Quotes**: 10 quotes in various states
- **Credit Notes**: 8 credit notes
- **Payments**: 10 payments
- **Bank Transactions**: 15 bank transactions
- **Tax Types**: OUTPUT, INPUT, EXEMPTOUTPUT, EXEMPTINPUT, BASEXCLUDED

### Scripts

```bash
# Generate new fixtures
npm run generate:fixtures

# Validate fixtures
npm run validate:fixtures
```

## Project Structure

```
src/
├── index.ts                 # MCP server entry point
├── adapters/                # Mock/live adapters
├── core/                    # Response formatting, security, database
└── tools/                   # MCP tool implementations
    ├── core/                # get_mcp_capabilities, switch_tenant, get_audit_log
    ├── validation/          # validate_schema, introspect_enums
    ├── simulation/          # dry_run, seed_sandbox, drive_lifecycle
    ├── chaos/               # simulate_network, replay_idempotency
    └── crud/                # create_contact, create_invoice, etc.

test/
├── fixtures/                # JSON test data
└── unit/                    # Unit tests (395 tests)
```

## Testing

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Security

- AES-256-GCM encryption for tokens (12-byte IV)
- Non-root Docker user
- SQLite with tenant isolation
- No secrets in responses

## Requirements

- Node.js 20.x or higher
- Docker (for containerised deployment)

## Licence

MIT

## Contributing

1. All tests must pass (`npm test`)
2. Fixtures must validate (`npm run validate:fixtures`)
3. Error messages should be educational with recovery suggestions
