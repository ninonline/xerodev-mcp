---
title: "MCP API Specification"
description: "Complete MCP protocol specification for xerodev-mcp"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["api", "specification", "mcp-protocol"]
category: "reference"
---

# MCP API Specification

This page describes the Model Context Protocol (MCP) implementation for xerodev-mcp.

## Protocol Overview

xerodev-mcp implements the [Model Context Protocol](https://modelcontextprotocol.io/) for AI agent tool integration.

**Transport**: `stdio` (standard input/output)
**Protocol Version**: JSON-RPC 2.0
**Server ID**: `xerodev-mcp`
**Server Version**: `0.2.0`

## Connection

### Transport

The server uses stdio transport for communication:

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Message Format

All messages follow JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { ... }
  }
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"data\":{...},...}"
      }
    ]
  }
}
```

## Tool Registration

All 25 tools are registered during server initialisation:

```typescript
server.tool(
  'tool_name',
  'Tool description',
  {
    parameter1: z.string().describe('Description'),
    parameter2: z.number().optional().describe('Description'),
  },
  async (args) => {
    const result = await handleTool(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);
```

## Standard Response Structure

All tools return a consistent response structure:

```typescript
interface MCPResponse<T = any> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;           // ISO 8601 datetime
    request_id: string;           // UUID v4
    execution_time_ms?: number;   // Execution time in ms
    score?: number;               // 0.0 to 1.0 (compliance score)
  };
  diagnostics?: {
    narrative: string;            // Human-readable explanation
    warnings?: string[];          // Warning messages
    root_cause?: string;          // Error root cause (failures only)
  };
  debug?: {
    logs?: string[];              // Debug log entries
    sql_queries?: string[];       // SQL queries executed
  };
  recovery?: {
    suggested_action_id: string;  // Action identifier
    description?: string;         // Action description
    next_tool_call?: {
      name: string;               // Next tool to call
      arguments: Record<string, any>; // Arguments for next tool
    };
  };
}
```

## Verbosity Levels

The `verbosity` parameter controls response detail across all tools:

| Level | Data | Meta | Diagnostics | Debug |
|-------|------|------|-------------|-------|
| `silent` | ✅ | ❌ | ❌ | ❌ |
| `compact` | ✅ | ✅ | ❌ | ❌ |
| `diagnostic` | ✅ | ✅ | ✅ | ❌ |
| `debug` | ✅ | ✅ | ✅ | ✅ |

### Silent Example

```json
{
  "success": true,
  "data": { "invoice_id": "inv-001" }
}
```

### Compact Example

```json
{
  "success": true,
  "data": { "invoice_id": "inv-001" },
  "meta": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "request_id": "abc-123",
    "execution_time_ms": 42
  }
}
```

### Diagnostic Example

```json
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
```

### Debug Example

```json
{
  "success": true,
  "data": { "invoice_id": "inv-001" },
  "meta": { ... },
  "diagnostics": { ... },
  "debug": {
    "logs": [
      "Loading tenant config",
      "Validating payload",
      "Creating invoice"
    ],
    "sql_queries": [
      "SELECT * FROM tenants WHERE tenant_id = ?",
      "INSERT INTO audit_log ..."
    ]
  }
}
```

## Error Handling

### Validation Errors

```json
{
  "success": false,
  "data": {
    "valid": false,
    "entity_type": "Invoice",
    "score": 0.0,
    "diff": [
      {
        "field": "LineItems[0].AccountCode",
        "issue": "AccountCode '999' does not exist",
        "severity": "error"
      }
    ]
  },
  "diagnostics": {
    "narrative": "Validation failed with 1 error(s).",
    "root_cause": "Invalid AccountCode"
  },
  "recovery": {
    "suggested_action_id": "find_valid_accounts",
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": {
        "tenant_id": "acme-au-001",
        "entity_type": "Account",
        "filter": { "status": "ACTIVE" }
      }
    }
  }
}
```

### Runtime Errors

```json
{
  "success": false,
  "data": null,
  "diagnostics": {
    "narrative": "Tenant not found: unknown-tenant",
    "root_cause": "Tenant does not exist"
  },
  "recovery": {
    "suggested_action_id": "list_tenants",
    "next_tool_call": {
      "name": "get_mcp_capabilities",
      "arguments": { "include_tenants": true }
    }
  }
}
```

## Tool Categories

### Core Tools (4)

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `get_mcp_capabilities` | Server info | `include_tenants`, `verbosity` | Server config, tenants |
| `switch_tenant_context` | Select tenant | `tenant_id`, `verbosity` | Tenant config |
| `get_audit_log` | View history | `tenant_id`, `tool_name`, `limit` | Audit log entries |

### Validation Tools (2)

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `validate_schema_match` | Validate payload | `tenant_id`, `entity_type`, `payload` | Validation result, score |
| `introspect_enums` | Get valid values | `tenant_id`, `entity_type`, `filter` | Valid values array |

### OAuth Tools (5)

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `get_authorization_url` | Start OAuth | `scopes`, `verbosity` | Authorization URL |
| `exchange_auth_code` | Complete OAuth | `callback_url`, `verbosity` | Connection info |
| `list_connections` | View connections | `include_inactive`, `verbosity` | Connection list |
| `refresh_connection` | Refresh tokens | `tenant_id`, `verbosity` | New token info |
| `revoke_connection` | Remove connection | `tenant_id`, `verbosity` | Revocation confirmation |

### Simulation Tools (3)

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `dry_run_sync` | Simulate batch | `tenant_id`, `operation`, `payloads` | Validation results |
| `seed_sandbox_data` | Generate data | `tenant_id`, `entity`, `count`, `scenario` | Generated IDs |
| `drive_lifecycle` | State transitions | `tenant_id`, `entity_type`, `entity_id`, `target_state` | New state |

### Chaos Tools (2)

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `simulate_network_conditions` | Inject failures | `tenant_id`, `condition`, `duration_seconds` | Simulation status |
| `replay_idempotency` | Test idempotency | `tenant_id`, `operation`, `payload`, `replay_count` | Replay results |

### CRUD Tools (10)

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `create_contact` | Create contact | `tenant_id`, `name`, `email`, ... | Contact ID |
| `create_invoice` | Create invoice | `tenant_id`, `type`, `contact_id`, `line_items` | Invoice ID |
| `create_quote` | Create quote | `tenant_id`, `contact_id`, `line_items` | Quote ID |
| `create_credit_note` | Create credit note | `tenant_id`, `type`, `contact_id`, `line_items` | Credit note ID |
| `create_payment` | Create payment | `tenant_id`, `invoice_id`, `account_id`, `amount` | Payment ID |
| `create_bank_transaction` | Create bank transaction | `tenant_id`, `type`, `bank_account_id`, `line_items` | Transaction ID |
| `get_contact` | Fetch contact | `tenant_id`, `contact_id` | Contact details |
| `get_invoice` | Fetch invoice | `tenant_id`, `invoice_id` | Invoice details |
| `list_contacts` | List contacts | `tenant_id`, `filters`, `page`, `page_size` | Contact list |
| `list_invoices` | List invoices | `tenant_id`, `filters`, `page`, `page_size` | Invoice list |

## Schema Types

### Invoice

```typescript
interface Invoice {
  type: 'ACCREC' | 'ACCPAY';
  contact_id: string;
  line_items: LineItem[];
  date?: string;        // YYYY-MM-DD
  due_date?: string;    // YYYY-MM-DD
  reference?: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED';
}

interface LineItem {
  description: string;
  quantity: number;
  unit_amount: number;
  account_code: string;
  tax_type?: string;
}
```

### Contact

```typescript
interface Contact {
  name: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  is_customer?: boolean;
  is_supplier?: boolean;
}
```

### Payment

```typescript
interface Payment {
  invoice_id?: string;
  credit_note_id?: string;
  account_id: string;
  amount: number;
  date?: string;        // YYYY-MM-DD
  reference?: string;
}
```

### Bank Transaction

```typescript
interface BankTransaction {
  type: 'RECEIVE' | 'SPEND' | 'RECEIVE-OVERPAYMENT' | 'RECEIVE-PREPAYMENT' | 'SPEND-OVERPAYMENT' | 'SPEND-PREPAYMENT';
  bank_account_id: string;
  contact_id?: string;
  line_items: LineItem[];
  date?: string;
  reference?: string;
}
```

## Tenant Context

### Multi-Region Support

| Tenant ID | Region | Tax System | Currency |
|-----------|--------|------------|----------|
| `acme-au-001` | Australia | GST (10%) | AUD |
| `company-uk-001` | United Kingdom | VAT (20%) | GBP |
| `startup-us-001` | United States | Sales Tax | USD |

### Tax Types by Region

**Australia (GST)**:
- `OUTPUT` - GST on sales
- `INPUT` - GST on purchases
- `EXEMPTOUTPUT` - GST-free sales
- `EXEMPTINPUT` - GST-free purchases
- `BASEXCLUDED` - No GST (not included in price)

**United Kingdom (VAT)**:
- `A` - Standard rate (20%)
- `E` - Exempt
- `Z` - Zero rate
- `AE` - Reduced rate
- `GST` - GST on sales (reverse charge)

**United States (Sales Tax)**:
- `NONE` - No tax
- `TX` - Tax applicable (state-specific)

## Rate Limiting

### Mock Mode
- **Unlimited** - No rate limiting

### Live Mode
- **60 requests/minute** per tenant (Xero API limit)
- Automatic backoff on 429 responses

## Idempotency

All CRUD write operations support idempotency keys:

```typescript
interface IdempotentRequest {
  idempotency_key?: string;
  // ... other fields
}
```

**Behaviour**:
- First request: Creates entity, returns ID
- Duplicate requests: Returns original ID without creating duplicate
- Keys are stored per tenant

## Database Schema

### Tenants Table

```sql
CREATE TABLE tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL UNIQUE,
    tenant_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at INTEGER NOT NULL,
    granted_scopes TEXT NOT NULL,
    xero_region TEXT,
    connection_status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_synced_at INTEGER,
    CHECK (connection_status IN ('active', 'expired', 'revoked'))
);
```

### Shadow State Table

```sql
CREATE TABLE shadow_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_data TEXT NOT NULL,
    account_code TEXT,
    account_type TEXT,
    tax_type TEXT,
    status TEXT,
    cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(tenant_id, entity_type, entity_id)
);
```

### Audit Log Table

```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,
    tool_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    success INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
```

## Security

### Token Encryption (Live Mode)

- **Algorithm**: AES-256-GCM
- **Key Size**: 256 bits (64 hex characters)
- **IV**: 12-byte random IV per encryption
- **Auth Tag**: 16-byte authentication tag

### Docker Security

```yaml
security_opt:
  - no-new-privileges:true
read_only: true
tmpfs:
  - /tmp:rw,noexec,nosuid,size=10m
```

### Tenant Isolation

- Each tenant has isolated data
- Cross-tenant queries prevented
- Audit log segregated by tenant

## I Want To...

- **Install the MCP server** → [Docker Desktop Guide](../installation/docker-desktop.md)
- **See all tools** → [Tools Reference](../user-guide/tools-reference.md)
- **Get started** → [Getting Started Guide](../user-guide/getting-started.md)
- **Troubleshoot** → [Troubleshooting](troubleshooting.md)

---

**← Back to:** [Reference](index.md) | **↑ Up to:** [Documentation Home](../index.md)
