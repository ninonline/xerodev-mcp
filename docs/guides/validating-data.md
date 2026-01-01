---
title: "Validating Data Before Sending to Xero"
description: "Learn how to use xerodev-mcp validation tools to ensure your data is correct before sending to Xero"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["validation", "tutorial", "schema-validation"]
category: "guides"
---

# Validating Data Before Sending to Xero

This guide explains how to use xerodev-mcp's validation tools to ensure your data is correct before sending it to Xero.

## Why Validate First?

Sending invalid data to Xero results in:
- **API errors** that are hard to debug
- **Delayed integrations** while you fix issues
- **Partial failures** in batch operations
- **Frustration** from generic error messages

xerodev-mcp's validation tools:
- Catch errors **before** you call Xero
- Provide **educational** error messages
- Suggest **exact fixes** for issues
- Include **recovery actions** you can follow

## The Validation Workflow

### Step 1: Get Server Capabilities

Always start by understanding what's available:

```
Call get_mcp_capabilities
```

This returns:
- Available tenants
- Their regions and tax systems
- Recommended workflow

### Step 2: Switch to Your Tenant

```
Call switch_tenant_context with tenant_id="your-tenant-id"
```

This loads the tenant's configuration:
- Chart of Accounts
- Valid TaxTypes
- Existing Contacts

### Step 3: Validate Your Payload

This is the most important step:

```
Call validate_schema_match with:
{
  "tenant_id": "your-tenant-id",
  "entity_type": "Invoice",
  "payload": { ... your invoice payload ... }
}
```

### Step 4: Follow Recovery Suggestions

If validation fails, the response includes `recovery.next_tool_call`:

```json
{
  "success": false,
  "recovery": {
    "suggested_action_id": "find_valid_accounts",
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": {
        "tenant_id": "your-tenant-id",
        "entity_type": "Account",
        "filter": {
          "type": "REVENUE",
          "status": "ACTIVE"
        }
      }
    }
  }
}
```

Call the suggested tool to find valid values.

### Step 5: Fix and Re-validate

Update your payload with valid values and validate again:

```
Call validate_schema_match with the corrected payload
```

Repeat until validation passes (score: 1.0).

### Step 6: Create the Entity

Once validated, create with confidence:

```
Call create_invoice with your validated payload
```

## Common Validation Scenarios

### Scenario 1: Invalid Account Code

**Problem**: Your invoice uses AccountCode "999" which doesn't exist.

**Validation response**:
```json
{
  "success": false,
  "data": {
    "diff": [
      {
        "field": "LineItems[0].AccountCode",
        "issue": "AccountCode '999' does not exist in tenant's Chart of Accounts",
        "severity": "error"
      }
    ],
    "score": 0.0
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

**Fix**:
```
Call introspect_enums with the suggested arguments
Choose a valid account code (e.g., "200" for Sales)
Update your payload
Re-validate
```

### Scenario 2: Invalid Tax Type for Region

**Problem**: Your UK tenant invoice uses TaxType "OUTPUT" (which is Australian).

**Validation response**:
```json
{
  "success": false,
  "data": {
    "diff": [
      {
        "field": "LineItems[0].TaxType",
        "issue": "TaxType 'OUTPUT' is not valid for UK region. Use 'A' for standard VAT sales.",
        "severity": "error"
      }
    ]
  }
}
```

**Fix**:
```
Call introspect_enums with entity_type="TaxRate"
See valid UK tax types (A, E, Z, etc.)
Update your payload with correct tax type
Re-validate
```

### Scenario 3: Contact Not Found

**Problem**: Your invoice references a contact that doesn't exist.

**Validation response**:
```json
{
  "success": false,
  "data": {
    "diff": [
      {
        "field": "contact_id",
        "issue": "Contact 'contact-999' not found",
        "severity": "error"
      }
    ]
  },
  "recovery": {
    "next_tool_call": {
      "name": "list_contacts",
      "arguments": {}
    }
  }
}
```

**Fix**:
```
Call list_contacts to see available contacts
Use an existing contact_id OR
Call create_contact to create a new one first
Re-validate
```

### Scenario 4: Archived Account

**Problem**: Your invoice uses an archived AccountCode.

**Validation response**:
```json
{
  "success": false,
  "data": {
    "diff": [
      {
        "field": "LineItems[0].AccountCode",
        "issue": "AccountCode '990' is ARCHIVED",
        "severity": "error"
      }
    ],
    "diagnostics": {
      "narrative": "Archived accounts cannot be used for new transactions. Use an active account instead."
    }
  },
  "recovery": {
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": {
        "entity_type": "Account",
        "filter": { "status": "ACTIVE", "type": "REVENUE" }
      }
    }
  }
}
```

**Fix**:
```
Call introspect_enums with the suggested filter
Choose an active account
Update your payload
Re-validate
```

## Understanding the Compliance Score

Validation returns a `score` from 0.0 to 1.0:

| Score | Meaning | Action |
|-------|---------|--------|
| 1.0 | Perfect validation | Safe to proceed |
| 0.8-0.9 | Minor warnings | Review but can proceed |
| 0.5-0.7 | Significant issues | Fix before proceeding |
| 0.0-0.4 | Critical errors | Must fix |
| 0.0 | Validation failed | Cannot proceed |

**Example with warnings**:
```json
{
  "success": false,
  "data": { "score": 0.85 },
  "diagnostics": {
    "narrative": "Invoice structure is valid, but contact is ARCHIVED. The invoice may be created but could cause issues.",
    "warnings": [
      "Contact 'contact-001' is ARCHIVED - invoice may fail"
    ]
  }
}
```

## Validating Different Entity Types

### Invoice

```
Call validate_schema_match with:
{
  "tenant_id": "your-tenant-id",
  "entity_type": "Invoice",
  "payload": {
    "type": "ACCREC",
    "contact_id": "contact-001",
    "line_items": [{
      "description": "Services",
      "quantity": 10,
      "unit_amount": 150,
      "account_code": "200",
      "tax_type": "OUTPUT"
    }]
  }
}
```

### Contact

```
Call validate_schema_match with:
{
  "tenant_id": "your-tenant-id",
  "entity_type": "Contact",
  "payload": {
    "name": "Acme Corporation",
    "email": "accounts@acme.com",
    "is_customer": true
  }
}
```

### Quote

```
Call validate_schema_match with:
{
  "tenant_id": "your-tenant-id",
  "entity_type": "Quote",
  "payload": {
    "contact_id": "contact-001",
    "line_items": [...]
  }
}
```

### Credit Note

```
Call validate_schema_match with:
{
  "tenant_id": "your-tenant-id",
  "entity_type": "CreditNote",
  "payload": {
    "type": "ACCRECCREDIT",
    "contact_id": "contact-001",
    "line_items": [...]
  }
}
```

### Payment

```
Call validate_schema_match with:
{
  "tenant_id": "your-tenant-id",
  "entity_type": "Payment",
  "payload": {
    "invoice_id": "inv-001",
    "account_id": "acc-027",
    "amount": 1650.00
  }
}
```

### Bank Transaction

```
Call validate_schema_match with:
{
  "tenant_id": "your-tenant-id",
  "entity_type": "BankTransaction",
  "payload": {
    "type": "RECEIVE",
    "bank_account_id": "acc-027",
    "contact_id": "contact-001",
    "line_items": [...]
  }
}
```

## Best Practices

### 1. Always Validate Before Creating

Never skip validation, even if you think the payload is correct:

```
// Good practice
Call validate_schema_match → Call create_invoice

// Risky
Call create_invoice directly
```

### 2. Use Diagnostic Verbosity When Learning

When debugging, use `verbosity="diagnostic"`:

```
Call validate_schema_match with verbosity="diagnostic"
```

This gives you:
- Detailed narrative explanations
- Recovery suggestions
- Warning messages

### 3. Follow Recovery Suggestions

The `recovery.next_tool_call` is designed to fix the exact issue:

```
// Recovery suggests introspect_enums
Call introspect_enums with the exact arguments from recovery
```

### 4. Introspect Before Building

Avoid validation errors by introspecting first:

```
// Get valid accounts
Call introspect_enums with entity_type="Account", filter={ type: "REVENUE", status: "ACTIVE" }

// Build payload with valid account codes
// Then validate (should pass with score: 1.0)
Call validate_schema_match
```

### 5. Handle Warnings Appropriately

Warnings don't prevent creation, but be careful:

```
// Score: 0.9 with warnings about archived contact
// Option 1: Proceed anyway
Call create_invoice (may work, may fail)

// Option 2: Fix first
Call create_contact with new contact
Re-validate with new contact_id
Call create_invoice (safer)
```

## Complete Example

Here's a complete workflow from invalid payload to successful creation:

### Initial Invalid Payload

```
Call validate_schema_match with:
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "payload": {
    "type": "ACCREC",
    "contact_id": "contact-999",  // Invalid
    "line_items": [{
      "description": "Services",
      "quantity": 10,
      "unit_amount": 150,
      "account_code": "999",  // Invalid
      "tax_type": "INVALID"  // Invalid
    }]
  }
}
```

**Response**: score: 0.0, multiple errors

### Fix Step 1: Find Valid Contact

```
Call introspect_enums with:
{
  "entity_type": "Contact",
  "filter": { "is_customer": true }
}
```

**Result**: Use "contact-001"

### Fix Step 2: Find Valid Account

```
Call introspect_enums with:
{
  "entity_type": "Account",
  "filter": { "type": "REVENUE", "status": "ACTIVE" }
}
```

**Result**: Use "200"

### Fix Step 3: Find Valid Tax Type

```
Call introspect_enums with:
{
  "entity_type": "TaxRate"
}
```

**Result**: Use "OUTPUT" (for Australian GST)

### Re-validate

```
Call validate_schema_match with:
{
  "tenant_id": "acme-au-001",
  "entity_type": "Invoice",
  "payload": {
    "type": "ACCREC",
    "contact_id": "contact-001",  // Fixed
    "line_items": [{
      "description": "Services",
      "quantity": 10,
      "unit_amount": 150,
      "account_code": "200",  // Fixed
      "tax_type": "OUTPUT"  // Fixed
    }]
  }
}
```

**Response**: success: true, score: 1.0

### Create

```
Call create_invoice with the validated payload
```

**Result**: Invoice created successfully!

## I Want To...

- **Learn how to use tools** → [Getting Started Guide](../user-guide/getting-started.md)
- **See common workflows** → [Workflow Guide](../user-guide/workflows.md)
- **See all tools reference** → [Tools Reference](../user-guide/tools-reference.md)
- **Set up live Xero** → [OAuth Setup Guide](oauth-setup.md)

---

**← Back to:** [Guides](index.md) | **↑ Up to:** [Documentation Home](../index.md)
