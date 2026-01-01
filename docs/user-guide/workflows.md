---
title: "Common Workflows"
description: "Task-based guides for common xerodev-mcp workflows"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["workflows", "tutorials", "task-based"]
category: "user-guide"
---

# Common Workflows

This page provides step-by-step guides for common workflows when using xerodev-mcp.

## I Want To...

- [Validate an invoice before sending to Xero](#validate-an-invoice)
- [Test my integration without live data](#-test-without-live-data)
- [Simulate API failures](#simulate-api-failures)
- [Connect to real Xero](#connect-to-live-xero)
- [Create a batch of invoices](#create-batch-invoices)
- [Test invoice lifecycles](#test-invoice-lifecycles)
- [Generate test data](#generate-test-data)
- [Debug validation failures](#debug-validation-failures)

---

## Validate an Invoice

**Goal**: Ensure an invoice payload is valid before sending to Xero.

### Workflow

1. **Get server capabilities**
   ```
   Call get_mcp_capabilities
   ```

2. **Switch to your tenant**
   ```
   Call switch_tenant_context with tenant_id="your-tenant-id"
   ```

3. **Validate the invoice**
   ```
   Call validate_schema_match with:
   {
     "tenant_id": "your-tenant-id",
     "entity_type": "Invoice",
     "payload": { ... your invoice payload ... }
   }
   ```

4. **If validation fails, follow the recovery path**
   - Check `recovery.next_tool_call` in the response
   - Call the suggested tool (usually introspect_enums)
   - Fix your payload
   - Validate again

5. **If validation passes, create the invoice**
   ```
   Call create_invoice with your validated payload
   ```

**What you get**:
- Detailed error messages if something is wrong
- Exact information about what needs fixing
- Suggested next steps to resolve issues

---

## Test Without Live Data

**Goal**: Test your Xero integration safely without affecting production data.

### Workflow

1. **Verify you're in mock mode**
   ```
   Call get_mcp_capabilities
   ```
   Look for `"mode": "mock"` in the response.

2. **Switch to a test tenant**
   ```
   Call switch_tenant_context with tenant_id="acme-au-001"
   ```

3. **List available test data**
   ```
   Call list_contacts to see available contacts
   Call introspect_enums with entity_type="Account" to see chart of accounts
   ```

4. **Create test invoices**
   ```
   Call create_invoice with test data
   ```

5. **Verify the invoice was created**
   ```
   Call get_invoice with the returned invoice_id
   ```

6. **Clean up (optional)**
   ```
   Call drive_lifecycle to VOID the test invoice
   ```

**What you get**:
- Safe testing environment
- Realistic test data
- No risk to production data
- Instant feedback

---

## Simulate API Failures

**Goal**: Test how your integration handles network failures and rate limits.

### Workflow

1. **Start a failure simulation**
   ```
   Call simulate_network_conditions with:
   {
     "tenant_id": "your-tenant-id",
     "condition": "RATE_LIMIT",
     "duration_seconds": 60
   }
   ```

2. **Attempt operations during simulation**
   ```
   Call create_invoice (will fail with 429 error)
   ```

3. **Clear the simulation**
   ```
   Call simulate_network_conditions with duration_seconds=0
   ```

4. **Test other failure scenarios**:
   - `TIMEOUT`: Simulates slow connections
   - `SERVER_ERROR`: Simulates 500 errors
   - `TOKEN_EXPIRED`: Simulates expired OAuth tokens
   - `INTERMITTENT`: Random failures at specified rate

**What you get**:
- Ability to test error handling
- Confidence in retry logic
- Better resilience in production

---

## Connect to Live Xero

**Goal**: Connect xerodev-mcp to your real Xero organisation.

### Workflow

1. **Set environment variables**
   ```bash
   export MCP_MODE=live
   export XERO_CLIENT_ID=your_client_id
   export XERO_CLIENT_SECRET=your_secret
   export XERO_REDIRECT_URI=http://localhost:3000/callback
   export MCP_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

2. **Start the server**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.live.yml up
   ```

3. **Get the OAuth URL**
   ```
   Call get_authorization_url
   ```

4. **Visit the URL in your browser**
   - Log in to Xero
   - Select organisations to authorise
   - Copy the callback URL from your browser

5. **Complete OAuth flow**
   ```
   Call exchange_auth_code with:
   {
     "callback_url": "the full URL from your browser"
   }
   ```

6. **List your connections**
   ```
   Call list_connections
   ```

7. **Switch to a live tenant**
   ```
   Call switch_tenant_context with your tenant_id
   ```

**What you get**:
- Access to real Xero data
- Live OAuth token management
- Automatic token refresh

**See also**: [OAuth Setup Guide](../guides/oauth-setup.md)

---

## Create Batch Invoices

**Goal**: Create multiple invoices efficiently while ensuring all are valid.

### Workflow

1. **Prepare your invoice payloads**
   ```json
   const invoices = [
     { type: "ACCREC", contact_id: "contact-001", line_items: [...] },
     { type: "ACCREC", contact_id: "contact-002", line_items: [...] },
     // ... more invoices
   ]
   ```

2. **Dry-run the batch**
   ```
   Call dry_run_sync with:
   {
     "tenant_id": "your-tenant-id",
     "operation": "create_invoices",
     "payloads": [... your invoices ...]
   }
   ```

3. **Review the results**
   - Check how many would succeed/fail
   - Review estimated totals
   - Fix any issues in failed payloads

4. **Create the valid invoices**
   ```
   For each valid invoice, call create_invoice
   ```

**What you get**:
- Batch validation before creation
- Early detection of issues
- No partial failures

---

## Test Invoice Lifecycles

**Goal**: Test how invoices move through different states (DRAFT → AUTHORISED → PAID).

### Workflow

1. **Create a draft invoice**
   ```
   Call create_invoice with status="DRAFT"
   ```

2. **Submit for approval**
   ```
   Call drive_lifecycle with:
   {
     "entity_type": "Invoice",
     "entity_id": "your-invoice-id",
     "target_state": "SUBMITTED"
   }
   ```

3. **Authorise the invoice**
   ```
   Call drive_lifecycle with target_state="AUTHORISED"
   ```

4. **Add a payment**
   ```
   Call drive_lifecycle with:
   {
     "entity_type": "Invoice",
     "entity_id": "your-invoice-id",
     "target_state": "PAID",
     "payment_amount": 1650.00,
     "payment_account_id": "acc-027"
   }
   ```

5. **Check the final state**
   ```
   Call get_invoice to verify status is PAID
   ```

**What you get**:
- Understanding of invoice states
- Testing of approval workflows
- Validation of payment logic

---

## Generate Test Data

**Goal**: Generate realistic test data for specific scenarios.

### Workflow

1. **Choose a scenario**:
   - `DEFAULT`: Standard mix of data
   - `OVERDUE_BILLS`: Past-due invoices
   - `MIXED_STATUS`: Various invoice states
   - `HIGH_VALUE`: Large amounts

2. **Generate the data**
   ```
   Call seed_sandbox_data with:
   {
     "tenant_id": "your-tenant-id",
     "entity": "INVOICES",
     "count": 20,
     "scenario": "OVERDUE_BILLS"
   }
   ```

3. **Use the generated IDs**
   ```
   Call get_invoice with one of the returned IDs
   ```

4. **Test your workflows**
   - Test debt collection with overdue invoices
   - Test reporting with mixed statuses
   - Test high-value approval flows

**What you get**:
- Instant test data generation
- Realistic scenarios
- Reusable test setups

---

## Debug Validation Failures

**Goal**: Understand and fix validation errors.

### Workflow

1. **Validate your payload**
   ```
   Call validate_schema_match with your payload
   ```

2. **Read the diagnostics**
   - Check `success` field
   - Read the `diagnostics.narrative`
   - Review any warnings

3. **Examine the diff**
   - Check `data.diff` array
   - Each item shows the field, issue, and severity

4. **Follow the recovery suggestion**
   ```
   Check recovery.next_tool_call
   Call the suggested tool with the provided arguments
   ```

5. **Fix your payload**
   - Update based on what you learned
   - Re-validate to confirm the fix

**Common issues**:
- **AccountCode not found**: Use introspect_enums to find valid codes
- **TaxType invalid for region**: Different regions use different tax types
- **ContactID missing**: Create the contact first or use an existing one
- **Archived accounts**: Filter for status="ACTIVE" when introspecting

**What you get**:
- Clear error messages
- Actionable fixes
- Learning about Xero requirements

---

## Advanced Workflows

### Test Idempotency

Ensure your integration handles duplicate requests correctly:

```
Call replay_idempotency with:
{
  "tenant_id": "your-tenant-id",
  "operation": "create_invoice",
  "payload": { ... },
  "replay_count": 5
}
```

The same invoice ID should be returned for all 5 replays.

### Multi-Region Testing

Test the same workflow across different regions:

```
// Australia
Call switch_tenant_context with tenant_id="acme-au-001"
Call validate_schema_match with payload

// United Kingdom
Call switch_tenant_context with tenant_id="uk-ltd-001"
Call validate_schema_match with same payload

// United States
Call switch_tenant_context with tenant_id="us-startup-001"
Call validate_schema_match with same payload
```

Note how TaxTypes differ between regions.

### Quote to Invoice Flow

Test converting a quote to an invoice:

```
// 1. Create a quote
Call create_quote

// 2. Accept the quote
Call drive_lifecycle with target_state="ACCEPTED"

// 3. Convert to invoice
Call drive_lifecycle with target_state="INVOICED"

// 4. Verify the invoice was created
Call list_invoices with a filter for the contact
```

## I Want To...

- **Install the MCP server** → [Docker Desktop Guide](../installation/docker-desktop.md)
- **Learn how to use tools** → [Getting Started Guide](getting-started.md)
- **See all available tools** → [Tools Reference](tools-reference.md)
- **Validate data before sending** → [Validation Tutorial](../guides/validating-data.md)

---

**← Back to:** [User Guide](index.md) | **↑ Up to:** [Documentation Home](../index.md)
