---
title: "Tools Reference"
description: "Complete reference for all 25 xerodev-mcp tools"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["reference", "tools", "mcp"]
category: "user-guide"
---

# Tools Reference

This page provides complete documentation for all 25 tools available in xerodev-mcp, organised by category.

## Quick Reference Table

| Tool | Purpose | Category |
|------|---------|----------|
| get_mcp_capabilities | Discover server capabilities | Core |
| switch_tenant_context | Switch between tenants | Core |
| get_audit_log | View tool invocation history | Core |
| validate_schema_match | Validate payloads before sending | Validation |
| introspect_enums | Get valid AccountCodes, TaxTypes | Validation |
| dry_run_sync | Simulate batch operations | Simulation |
| seed_sandbox_data | Generate test data | Simulation |
| drive_lifecycle | Transition entities through states | Simulation |
| simulate_network_conditions | Inject failures | Chaos |
| replay_idempotency | Test idempotency behaviour | Chaos |
| create_contact | Create new contacts | CRUD |
| create_invoice | Create sales invoices or bills | CRUD |
| create_quote | Create quotes/proposals | CRUD |
| create_credit_note | Create credit notes | CRUD |
| create_payment | Record payments | CRUD |
| create_bank_transaction | Record bank transactions | CRUD |
| get_contact | Fetch a single contact | CRUD |
| get_invoice | Fetch a single invoice | CRUD |
| list_contacts | List contacts with filters | CRUD |
| list_invoices | List invoices with filters | CRUD |
| get_authorization_url | Start OAuth flow | OAuth |
| exchange_auth_code | Complete OAuth with callback | OAuth |
| list_connections | View connected tenants | OAuth |
| refresh_connection | Refresh expired tokens | OAuth |
| revoke_connection | Remove a connection | OAuth |

---

## Core Tools

### get_mcp_capabilities

**Purpose**: Returns server capabilities and AI agent guidelines. **Always call this first** before any other tool.

**When to use**:
- At the start of every conversation
- To understand available tenants and regions
- To check server mode (mock or live)

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| include_tenants | boolean | `true` | Include list of available tenants |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "include_tenants": true,
  "verbosity": "diagnostic"
}
```

**Returns**:
- Server mode (mock or live)
- Available tenants (AU/GST, UK/VAT, US)
- Required workflow for AI agents
- Rate limit information

**Related tools**: All tools (call this first)

---

### switch_tenant_context

**Purpose**: Switch to a different Xero tenant/organisation.

**When to use**:
- Before performing operations on a specific tenant
- To work with multi-region scenarios
- To load tenant-specific configuration

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | The tenant ID to switch to |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Tenant configuration
- Region and currency
- Available accounts and tax types

**Related tools**: get_mcp_capabilities, introspect_enums

---

### get_audit_log

**Purpose**: Retrieve audit log entries for tool invocations.

**When to use**:
- Debugging issues by reviewing past tool calls
- Tracking success/failure rates
- Monitoring usage patterns per tenant
- Identifying problematic operations

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | optional | Filter by tenant ID |
| tool_name | string | optional | Filter by tool name |
| success | boolean | optional | Filter by success status |
| include_stats | boolean | `true` | Include statistics summary |
| limit | number | `20` | Maximum entries to return (1-100) |
| offset | number | `0` | Offset for pagination |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "tool_name": "create_invoice",
  "success": false,
  "include_stats": true,
  "limit": 20,
  "verbosity": "diagnostic"
}
```

**Returns**:
- Array of audit log entries
- Statistics summary (if requested)
- Timestamps and request IDs

**Related tools**: All tools (for debugging)

---

## Validation Tools

### validate_schema_match

**Purpose**: Validates a payload against Xero's schema AND the tenant's specific configuration. **This is the most important tool** - call it before any write operation.

**When to use**:
- Before creating any invoice, contact, or payment
- After modifying a payload
- When unsure if AccountCodes or TaxTypes are valid
- To get detailed error messages with recovery suggestions

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| entity_type | string | required | Type of entity: Invoice, Contact, Quote, CreditNote, Payment, BankTransaction |
| payload | object | required | The payload to validate |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
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
  },
  "verbosity": "diagnostic"
}
```

**Returns**:
- Valid/invalid status
- Compliance score (0.0 to 1.0)
- Detailed diff showing what's wrong
- Recovery suggestions with next_tool_call

**Related tools**: introspect_enums, create_invoice, create_contact

---

### introspect_enums

**Purpose**: Get valid values for fields in the tenant's Xero configuration.

**When to use**:
- After validate_schema_match fails
- To find valid AccountCodes for invoices
- To find valid TaxTypes for the tenant's region
- To find valid ContactIDs

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| entity_type | string | required | Type of entity: Account, TaxRate, Contact |
| filter | object | optional | Optional filter criteria |
| verbosity | string | `compact` | Response verbosity level |

**Filter options**:
| Property | Type | Description |
|----------|------|-------------|
| type | string | Account type: REVENUE, EXPENSE, BANK, etc. |
| status | string | ACTIVE or ARCHIVED |
| is_customer | boolean | Filter to customers only |
| is_supplier | boolean | Filter to suppliers only |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "entity_type": "Account",
  "filter": {
    "type": "REVENUE",
    "status": "ACTIVE"
  },
  "verbosity": "compact"
}
```

**Returns**:
- Array of valid values
- Codes, names, and statuses
- Tenant-specific configuration

**Related tools**: validate_schema_match

---

## Simulation Tools

### dry_run_sync

**Purpose**: Simulates a batch operation without actually executing it.

**When to use**:
- Test batch invoice creation before running for real
- Identify which payloads in a batch would fail
- Get estimated totals and counts
- Understand the impact of a batch operation

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| operation | string | required | Type of batch operation: create_invoices, create_contacts |
| payloads | array | required | Array of payloads to simulate (max 50) |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "operation": "create_invoices",
  "payloads": [
    { "type": "ACCREC", "contact_id": "contact-001", "line_items": [...] },
    { "type": "ACCREC", "contact_id": "contact-002", "line_items": [...] }
  ],
  "verbosity": "diagnostic"
}
```

**Returns**:
- Number that would succeed/fail
- Estimated total amount
- Issues summary
- Recovery suggestions

**Related tools**: validate_schema_match, create_invoice

---

### seed_sandbox_data

**Purpose**: Generates realistic test data for testing.

**When to use**:
- Need specific test scenarios
- Want to test with overdue bills
- Need high-value invoices for testing
- Want to test mixed status scenarios

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| entity | string | required | Type of entity: CONTACTS, INVOICES |
| count | number | `10` | Number of entities to generate (1-50) |
| scenario | string | `DEFAULT` | Scenario type |
| verbosity | string | `diagnostic` | Response verbosity level |

**Scenarios**:
| Scenario | Description |
|----------|-------------|
| DEFAULT | Standard mix of data |
| OVERDUE_BILLS | Invoices 30-90 days past due |
| MIXED_STATUS | Mix of DRAFT, AUTHORISED, and PAID |
| HIGH_VALUE | Invoices with large amounts |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "entity": "INVOICES",
  "count": 10,
  "scenario": "OVERDUE_BILLS",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Generated payloads
- Sample IDs you can use in subsequent tool calls

**Related tools**: create_invoice, create_contact

---

### drive_lifecycle

**Purpose**: Transitions an entity through its lifecycle states.

**When to use**:
- Test invoice approval workflows
- Test quote acceptance flows
- Test credit note processing
- Simulate payment scenarios

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| entity_type | string | required | Type of entity: Invoice, Quote, CreditNote |
| entity_id | string | required | ID of the entity to transition |
| target_state | string | required | Target state to transition to |
| payment_amount | number | optional | Payment amount (for PAID transition) |
| payment_account_id | string | optional | Bank account ID (for PAID transition) |
| verbosity | string | `diagnostic` | Response verbosity level |

**Invoice states**: DRAFT → SUBMITTED → AUTHORISED → PAID (terminal). Any state → VOIDED (except PAID).

**Quote states**: DRAFT → SENT → ACCEPTED → INVOICED (terminal). SENT/ACCEPTED → DECLINED. DECLINED → DRAFT for re-editing.

**Credit note states**: DRAFT → SUBMITTED → AUTHORISED → PAID (terminal). Any state → VOIDED (except PAID).

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "entity_id": "inv-001",
  "target_state": "AUTHORISED",
  "verbosity": "diagnostic"
}
```

**For PAID transitions, include payment details**:
```json
{
  "payment_amount": 1650.00,
  "payment_account_id": "acc-027"
}
```

**Returns**:
- New state
- Transition details
- Any warnings or issues

**Related tools**: create_invoice, create_quote, create_payment

---

## Chaos Tools

### simulate_network_conditions

**Purpose**: Simulates various network conditions to test integration resilience.

**When to use**:
- Test how your integration handles rate limits
- Test timeout handling
- Test server error recovery
- Test OAuth token expiration handling

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| condition | string | required | Network condition to simulate |
| duration_seconds | number | `60` | Duration in seconds (0 to clear, max 300) |
| failure_rate | number | `1.0` | Probability of failure for INTERMITTENT condition (0-1) |
| verbosity | string | `diagnostic` | Response verbosity level |

**Conditions**:
| Condition | Description |
|-----------|-------------|
| RATE_LIMIT | Simulates Xero's 60 requests/minute limit (429 responses) |
| TIMEOUT | Simulates slow/hanging connections |
| SERVER_ERROR | Simulates 500/502/503 errors |
| TOKEN_EXPIRED | Simulates OAuth token expiration (401 responses) |
| INTERMITTENT | Random failures at specified rate |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "condition": "RATE_LIMIT",
  "duration_seconds": 60,
  "verbosity": "diagnostic"
}
```

**To clear simulation**:
```json
{
  "duration_seconds": 0
}
```

**Returns**:
- Simulation status
- Duration remaining
- Affected operations

**Related tools**: replay_idempotency

---

### replay_idempotency

**Purpose**: Tests idempotency behaviour by replaying the same request multiple times.

**When to use**:
- Verify your integration correctly handles duplicate requests
- Test consistent response on replays
- Verify proper idempotency key usage
- Ensure no duplicate data is created

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| operation | string | required | Operation type: create_invoice, create_contact, create_payment |
| idempotency_key | string | optional | Unique key to use (generated if not provided) |
| payload | object | required | The payload to use for the operation |
| replay_count | number | `3` | Number of times to replay the request (1-10) |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "operation": "create_invoice",
  "idempotency_key": "my-unique-key",
  "payload": {
    "type": "ACCREC",
    "contact_id": "contact-001",
    "line_items": [...]
  },
  "replay_count": 5,
  "verbosity": "diagnostic"
}
```

**Returns**:
- Detailed report of each replay
- Whether idempotency was correctly maintained
- Entity IDs (should be identical across replays)

**Related tools**: create_invoice, create_contact, create_payment

---

## CRUD Tools

### create_contact

**Purpose**: Creates a new contact in the Xero organisation.

**When to use**:
- Adding a new customer or supplier
- Before creating invoices for a new contact
- Building contact databases

**Prerequisites**:
1. Call switch_tenant_context
2. Call validate_schema_match with entity_type='Contact'

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| name | string | required | Contact name (required) |
| email | string | optional | Contact email address |
| first_name | string | optional | First name |
| last_name | string | optional | Last name |
| phone | string | optional | Phone number |
| is_customer | boolean | `true` | Whether this is a customer |
| is_supplier | boolean | `false` | Whether this is a supplier |
| idempotency_key | string | optional | Unique key to prevent duplicate creation |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "name": "Acme Corporation",
  "email": "accounts@acme.com",
  "is_customer": true,
  "is_supplier": false,
  "idempotency_key": "unique-contact-2025-01-01",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Contact ID
- Created contact details
- Creation timestamp

**Related tools**: get_contact, list_contacts, validate_schema_match

---

### create_invoice

**Purpose**: Creates a new invoice in the Xero organisation.

**When to use**:
- Creating sales invoices (ACCREC)
- Creating bills from suppliers (ACCPAY)

**Prerequisites**:
1. Call switch_tenant_context
2. Verify ContactID exists: use introspect_enums with entity_type='Contact'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'
4. Call validate_schema_match with entity_type='Invoice'

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| type | string | required | Invoice type: ACCREC or ACCPAY |
| contact_id | string | required | Contact ID for the invoice |
| line_items | array | required | Line items (min 1) |
| date | string | optional | Invoice date (YYYY-MM-DD) |
| due_date | string | optional | Due date (YYYY-MM-DD) |
| reference | string | optional | Reference number |
| status | string | `DRAFT` | DRAFT, SUBMITTED, or AUTHORISED |
| idempotency_key | string | optional | Unique key to prevent duplicate creation |
| verbosity | string | `diagnostic` | Response verbosity level |

**Line item properties**:
| Property | Type | Description |
|----------|------|-------------|
| description | string | Line item description |
| quantity | number | Quantity (must be positive) |
| unit_amount | number | Unit amount |
| account_code | string | Account code |
| tax_type | string | Tax type (optional) |

**Example**:
```json
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
  "date": "2025-01-15",
  "due_date": "2025-02-15",
  "status": "DRAFT",
  "idempotency_key": "unique-invoice-2025-01-01",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Invoice ID
- Created invoice details
- Totals and tax calculations

**Related tools**: get_invoice, list_invoices, validate_schema_match, drive_lifecycle

---

### create_quote

**Purpose**: Creates a new quote/proposal in the Xero organisation.

**When to use**:
- Creating quotes or proposals for customers
- Providing estimates before invoicing

**Prerequisites**:
1. Call switch_tenant_context
2. Verify ContactID exists
3. Verify AccountCodes exist
4. Call validate_schema_match with entity_type='Quote'

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| contact_id | string | required | Contact ID for the quote recipient |
| line_items | array | required | Line items (min 1) |
| date | string | optional | Quote date (YYYY-MM-DD) |
| expiry_date | string | optional | Expiry date (YYYY-MM-DD) |
| title | string | optional | Quote title/subject |
| summary | string | optional | Quote summary |
| terms | string | optional | Terms and conditions |
| idempotency_key | string | optional | Unique key to prevent duplicate creation |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "contact_id": "contact-001",
  "line_items": [{
    "description": "Consulting Services",
    "quantity": 10,
    "unit_amount": 150.00,
    "account_code": "200",
    "tax_type": "OUTPUT"
  }],
  "title": "Project Proposal",
  "expiry_date": "2025-02-28",
  "idempotency_key": "unique-quote-2025-01-01",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Quote ID
- Created quote details
- Expiry information

**Related tools**: drive_lifecycle, create_invoice

---

### create_credit_note

**Purpose**: Creates a new credit note in the Xero organisation.

**When to use**:
- Issuing credits to customers
- Recording supplier credits
- Refunding returned items

**Prerequisites**:
1. Call switch_tenant_context
2. Verify ContactID exists
3. Verify AccountCodes exist

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| type | string | required | ACCRECCREDIT or ACCPAYCREDIT |
| contact_id | string | required | Contact ID for the credit note |
| line_items | array | required | Line items (min 1) |
| date | string | optional | Credit note date (YYYY-MM-DD) |
| reference | string | optional | Reference number |
| idempotency_key | string | optional | Unique key to prevent duplicate creation |
| verbosity | string | `diagnostic` | Response verbosity level |

**Types**:
| Type | Description |
|------|-------------|
| ACCRECCREDIT | Accounts Receivable Credit (credit to customer) |
| ACCPAYCREDIT | Accounts Payable Credit (credit from supplier) |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "type": "ACCRECCREDIT",
  "contact_id": "contact-001",
  "line_items": [{
    "description": "Refund for returned items",
    "quantity": 1,
    "unit_amount": 100.00,
    "account_code": "200",
    "tax_type": "OUTPUT"
  }],
  "idempotency_key": "unique-credit-2025-01-01",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Credit note ID
- Created credit note details

**Related tools**: drive_lifecycle

---

### create_payment

**Purpose**: Creates a new payment against an invoice or credit note.

**When to use**:
- Recording customer payments
- Recording supplier payments
- Applying payments to invoices

**Prerequisites**:
1. Call switch_tenant_context
2. Verify invoice or credit note exists
3. Verify bank account exists: use introspect_enums with entity_type='Account' and filter type='BANK'

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| invoice_id | string | optional | Invoice ID to apply payment to |
| credit_note_id | string | optional | Credit note ID to refund |
| account_id | string | required | Bank account ID for the payment |
| amount | number | required | Payment amount (must be positive) |
| date | string | optional | Payment date (YYYY-MM-DD) |
| reference | string | optional | Payment reference |
| idempotency_key | string | optional | Unique key to prevent duplicate creation |
| verbosity | string | `diagnostic` | Response verbosity level |

**Important**: Must specify either invoice_id OR credit_note_id (not both). Payment amount cannot exceed the remaining balance.

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "invoice_id": "inv-001",
  "account_id": "acc-027",
  "amount": 1650.00,
  "date": "2025-01-15",
  "reference": "Payment for INV-001",
  "idempotency_key": "unique-payment-2025-01-01",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Payment ID
- Payment details
- Remaining balance on invoice

**Related tools**: get_invoice, drive_lifecycle

---

### create_bank_transaction

**Purpose**: Creates a new bank transaction (receive or spend money).

**When to use**:
- Recording money received from customers
- Recording payments to suppliers
- Recording overpayments and prepayments

**Prerequisites**:
1. Call switch_tenant_context
2. Verify bank account exists
3. Verify AccountCodes exist

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| type | string | required | Transaction type |
| bank_account_id | string | required | Bank account ID |
| contact_id | string | optional | Contact ID |
| line_items | array | required | Line items (min 1) |
| date | string | optional | Transaction date (YYYY-MM-DD) |
| reference | string | optional | Transaction reference |
| idempotency_key | string | optional | Unique key to prevent duplicate creation |
| verbosity | string | `diagnostic` | Response verbosity level |

**Transaction types**:
| Type | Description |
|------|-------------|
| RECEIVE | Money received (e.g., customer payment) |
| SPEND | Money spent (e.g., supplier payment) |
| RECEIVE-OVERPAYMENT | Overpayment received |
| RECEIVE-PREPAYMENT | Prepayment received |
| SPEND-OVERPAYMENT | Overpayment made |
| SPEND-PREPAYMENT | Prepayment made |

**Example**:
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
    "account_code": "200",
    "tax_type": "OUTPUT"
  }],
  "date": "2025-01-15",
  "reference": "BANK-TRX-001",
  "idempotency_key": "unique-bank-2025-01-01",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Bank transaction ID
- Transaction details

**Related tools**: get_invoice, create_payment

---

### get_invoice

**Purpose**: Fetches a single invoice by ID from the Xero organisation.

**When to use**:
- Retrieve invoice details after creation
- Check invoice status before applying payment
- Verify invoice totals and line items

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| invoice_id | string | required | Invoice ID to fetch |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "invoice_id": "inv-001",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Full invoice details
- Contact information
- Line items and totals
- Status and currency

**Related tools**: create_invoice, list_invoices, create_payment

---

### get_contact

**Purpose**: Fetches a single contact by ID from the Xero organisation.

**When to use**:
- Retrieve contact details before creating invoice
- Verify contact exists and is active
- Get contact addresses and phone numbers

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| contact_id | string | required | Contact ID to fetch |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "contact_id": "contact-001",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Full contact details
- Name and email
- Addresses and phones
- Customer/supplier flags

**Related tools**: create_contact, list_contacts

---

### list_invoices

**Purpose**: Lists invoices from the Xero organisation with optional filters.

**When to use**:
- Browse all invoices
- Find invoices by status
- Filter by contact or date range
- Paginate through large result sets

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| status | string | optional | Filter by status: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED |
| type | string | optional | Filter by type: ACCREC or ACCPAY |
| contact_id | string | optional | Filter by contact ID |
| from_date | string | optional | Filter from date (YYYY-MM-DD) |
| to_date | string | optional | Filter to date (YYYY-MM-DD) |
| page | number | `1` | Page number (starts at 1) |
| page_size | number | `20` | Items per page (max 100) |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "status": "AUTHORISED",
  "type": "ACCREC",
  "from_date": "2025-01-01",
  "to_date": "2025-01-31",
  "page": 1,
  "page_size": 20,
  "verbosity": "diagnostic"
}
```

**Returns**:
- Array of invoices
- Pagination information
- Total count

**Related tools**: get_invoice, create_invoice

---

### list_contacts

**Purpose**: Lists contacts from the Xero organisation with optional filters.

**When to use**:
- Browse all contacts
- Find customers or suppliers
- Search by name or email
- Filter by status

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | Target tenant ID |
| status | string | optional | Filter by status: ACTIVE or ARCHIVED |
| is_customer | boolean | optional | Filter to customers only |
| is_supplier | boolean | optional | Filter to suppliers only |
| search | string | optional | Search by name or email (case-insensitive) |
| page | number | `1` | Page number (starts at 1) |
| page_size | number | `20` | Items per page (max 100) |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "is_customer": true,
  "search": "acme",
  "page": 1,
  "page_size": 20,
  "verbosity": "diagnostic"
}
```

**Returns**:
- Array of contacts
- Pagination information
- Total count

**Related tools**: get_contact, create_contact

---

## OAuth Tools

### get_authorization_url

**Purpose**: Generates a Xero OAuth 2.0 authorization URL for the user to visit in their browser.

**When to use**:
- STEP 1 OF OAUTH FLOW - Call this tool first
- Starting the OAuth process for live Xero connection
- When you need to authorise access to a Xero organisation

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| scopes | array | optional | OAuth scopes to request |
| verbosity | string | `diagnostic` | Response verbosity level |

**Default scopes** (if not specified):
- `accounting.transactions`
- `accounting.reports.read`
- `accounting.journals.read`
- `accounting.contacts`
- `accounting.settings`
- `offline_access` (for refresh tokens)

**Example**:
```json
{
  "scopes": [
    "accounting.transactions",
    "accounting.contacts",
    "offline_access"
  ],
  "verbosity": "diagnostic"
}
```

**Returns**:
- Authorization URL to visit in browser
- State parameter for security
- Instructions for next steps

**What happens next**:
1. User visits the returned URL in a web browser
2. User logs into Xero (if not already logged in)
3. User selects which Xero organisation(s) to authorise
4. Xero redirects to the callback URL with an authorization code
5. User copies the full callback URL
6. User calls exchange_auth_code with the callback URL

**Related tools**: exchange_auth_code, list_connections

---

### exchange_auth_code

**Purpose**: Exchanges the OAuth authorization code (from callback URL) for access tokens and stores them securely.

**When to use**:
- STEP 2 OF OAUTH FLOW - After calling get_authorization_url
- After completing authorisation in the browser
- When you have the callback URL from Xero

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| callback_url | string | required | The full callback URL from the browser after authorisation |
| verbosity | string | `diagnostic` | Response verbosity level |

**How to get the callback URL**:
1. Visit the authorization URL from get_authorization_url
2. Log in to Xero and select organisations to authorise
3. After authorisation, Xero redirects to your redirect URI
4. The URL in your browser bar is the callback URL - copy the entire URL
5. Pass that URL to this tool as callback_url

**Example**:
```json
{
  "callback_url": "http://localhost:3000/callback?code=xyz&state=abc",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Connected tenant information
- Token expiration details
- Number of connections stored

**Related tools**: get_authorization_url, list_connections

---

### list_connections

**Purpose**: Lists all stored Xero tenant connections from the database.

**When to use**:
- After completing the OAuth flow
- To see all available connections
- To check connection status (active, expired, revoked)

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| include_inactive | boolean | `false` | Include expired and revoked connections |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "include_inactive": false,
  "verbosity": "diagnostic"
}
```

**Returns**:
- Array of connections
- Tenant IDs and names
- Connection statuses
- Token expiration information

**Connection statuses**:
| Status | Description |
|--------|-------------|
| active | Tokens are valid and ready to use |
| expired | Tokens have expired and need refresh |
| revoked | Connection has been removed |

**Related tools**: get_authorization_url, exchange_auth_code, refresh_connection

---

### refresh_connection

**Purpose**: Manually refreshes OAuth tokens for a stored connection.

**When to use**:
- After a connection is marked as 'expired'
- If you suspect tokens are stale
- To manually trigger token refresh

**Note**: Token refresh happens automatically during normal API calls. You typically don't need to call this tool manually.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | The tenant ID to refresh tokens for |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "verbosity": "diagnostic"
}
```

**Returns**:
- New token expiration time
- Connection status

**Related tools**: list_connections, revoke_connection

---

### revoke_connection

**Purpose**: Removes a stored Xero tenant connection from the database.

**When to use**:
- You want to disconnect a Xero organisation
- You need to re-authorise a connection
- Cleaning up old/unused connections

**Warning**: This operation cannot be undone. After revoking, you must complete the OAuth flow again to reconnect.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tenant_id | string | required | The tenant ID to revoke |
| verbosity | string | `diagnostic` | Response verbosity level |

**Example**:
```json
{
  "tenant_id": "acme-au-001",
  "verbosity": "diagnostic"
}
```

**Returns**:
- Revocation confirmation
- Number of remaining connections

**Related tools**: get_authorization_url, exchange_auth_code

---

## I Want To...

- **Install the MCP server** → [Docker Desktop Guide](../installation/docker-desktop.md)
- **Learn how to use tools** → [Getting Started Guide](getting-started.md)
- **See common workflows** → [Workflow Guide](workflows.md)
- **Validate data before sending** → [Validation Tutorial](../guides/validating-data.md)

---

**← Back to:** [User Guide](index.md) | **↑ Up to:** [Documentation Home](../index.md)
