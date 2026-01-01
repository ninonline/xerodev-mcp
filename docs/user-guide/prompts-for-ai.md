---
title: "AI Prompt Library"
description: "Ready-to-use prompts for Claude and other AI assistants to use with xerodev-mcp"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["prompts", "ai-assistants", "workflow"]
category: "user-guide"
---

# AI Prompt Library

This page contains ready-to-use prompts that you can give to Claude Code, Continue.dev, Cursor, or other AI assistants to effectively use xerodev-mcp for building, testing, and diagnosing Xero integrations.

## Quick Start Prompts

### Discover the Server

```
Call get_mcp_capabilities to see what tools are available.
```

### Check Available Tenants

```
Call get_mcp_capabilities with include_tenants=true to see all available tenants and their regions.
```

### Get Started with Validation

```
I want to validate an invoice before sending it to Xero. Show me how to use the validate_schema_match tool.
```

---

## Integration Building Prompts

### Validate My Invoice Payload

```
I'm building a Xero integration and I want to validate my invoice payload before sending it to the real Xero API. Here's my payload:

[PASTE YOUR INVOICE JSON]

Call validate_schema_match with tenant_id="acme-au-001" and entity_type="Invoice" to check if it's valid.
```

### Check if My Contact Structure is Valid

```
I have a contact object from my application. Can you validate it against the Xero schema?

[PASTE YOUR CONTACT JSON]

Use tenant_id="acme-au-001" and tell me if it will pass or fail, and what I need to fix.
```

### Find Valid Account Codes

```
I need to create an invoice for consulting services. What account codes should I use?

Call introspect_enums with tenant_id="acme-au-001", entity_type="Account", and filter for type="REVENUE" and status="ACTIVE".
```

### Check What Tax Types Are Available

```
What tax types are available for the Australian tenant?

Call introspect_enums with tenant_id="acme-au-001" and entity_type="TaxRate".
```

### Validate Multiple Invoices at Once

```
I have 10 invoices to import. Can you validate all of them before I send them to Xero?

[PASTE ALL INVOICE JSON]

Use dry_run_sync with operation="create_invoices" to test them in a batch.
```

---

## Testing Prompts

### Test Invoice Creation Workflow

```
I want to test the full invoice creation workflow. Can you:

1. Switch to the Australian tenant
2. Validate this invoice payload: [PASTE INVOICE]
3. If valid, create the invoice
4. Then transition it to AUTHORISED status
5. Finally, add a payment to mark it as PAID

Show me the results at each step.
```

### Test with Invalid Data

```
I want to test how my integration handles validation errors. Can you:

1. Validate an invoice with an invalid account code "999"
2. Show me what error message we get
3. Follow the recovery suggestion to find valid codes
4. Fix the payload and validate again

This will help me understand the error handling flow.
```

### Test Multi-Region Support

```
I need to verify my integration works across different regions. Can you:

1. Validate the same invoice against Australian (GST), UK (VAT), and US tenants
2. Show me what tax types work for each region
3. Tell me if I need to adjust my payload for different regions

[PASTE YOUR INVOICE JSON]
```

### Test Idempotency

```
I want to make sure my integration handles duplicate requests correctly. Can you:

1. Create an invoice with idempotency_key="test-duplicate-2025-01-01"
2. Then call replay_idempotency to test what happens if the same request is sent 5 times
3. Tell me if the invoice gets duplicated or if idempotency works correctly
```

### Simulate Rate Limiting

```
I want to test how my integration handles rate limits. Can you:

1. Call simulate_network_conditions with condition="RATE_LIMIT" and duration_seconds=60
2. Then try to create an invoice
3. Show me what error we get and suggest how to handle retry logic
```

---

## Diagnostics Prompts

### Check Recent Tool Calls

```
Something isn't working right. Can you call get_audit_log to show me the last 20 tool calls and whether they succeeded or failed?
```

### Debug a Failed Validation

```
My invoice validation failed. Can you:

1. Call validate_schema_match with my payload and verbosity="debug"
2. Show me the full error details
3. Tell me exactly what fields are wrong and what the valid values should be
```

### Diagnose Connection Issues

```
I think there might be a connection issue. Can you call diagnose_connection to check the health of the MCP server?
```

### Review Audit Trail

```
Show me all failed operations from the audit log so I can see what went wrong.

Call get_audit_log with success=false and limit=50.
```

---

## Learning Prompts

### Teach Me the Validation Workflow

```
I'm new to Xero integration. Can you walk me through the complete workflow for creating a validated invoice?

Step by step:
1. How to discover what tenants are available
2. How to find valid account codes
3. How to validate my invoice
4. How to create the invoice after validation
```

### Explain the Error Recovery System

```
I got a validation error with a recovery.next_tool_call suggestion. Can you explain:

1. What this recovery system is
2. How to follow the suggested next_tool_call
3. Why this helps me fix my integration faster

Show me an example with an invalid account code.
```

### Show Me All Tools in a Category

```
What tools are available for validation? Show me how to use validate_schema_match and introspect_enums with examples.
```

---

## Advanced Prompts

### Batch Import Testing

```
I'm importing 50 invoices from a CSV. Can you:

1. Use seed_sandbox_data to generate 50 test invoices with scenario="MIXED_STATUS"
2. Use dry_run_sync to validate all 50 before I attempt the real import
3. Tell me how many would pass or fail
4. Show me what issues I need to fix in my CSV mapping
```

### Test Quote to Invoice Flow

```
I need to test the quote-to-invoice conversion workflow. Can you:

1. Create a quote for a customer
2. Accept the quote
3. Convert it to an invoice
4. Show me the status at each step
```

### Test Partial Payments

```
I want to test how partial payments work. Can you:

1. Create an invoice for £1000
2. Add a partial payment of £600
3. Check the remaining balance
4. Try to add another payment for the remaining £400
5. Show me the final status
```

### Test Credit Note Scenarios

```
I need to test refund scenarios. Can you:

1. Create an invoice and authorise it
2. Create a credit note for a partial refund
3. Allocate the credit note to the invoice
4. Show me the invoice status after allocation
```

### Test Bank Transaction Reconciliation

```
I'm testing bank transaction import. Can you:

1. Create a RECEIVE bank transaction for £500
2. Create a SPEND bank transaction for £200
3. Show me how they appear in the system
4. Validate the account codes used
```

---

## Scenario-Based Prompts

### Scenario: Overdue Invoice Testing

```
I want to test my overdue invoice handling. Can you:

1. Use seed_sandbox_data to generate 10 overdue invoices (scenario="OVERDUE_BILLS")
2. Show me the invoice dates and due dates
3. Tell me which invoices are overdue
4. List them using list_invoices with appropriate filters
```

### Scenario: Foreign Currency

```

I'm testing multi-currency invoices. Can you:

1. Switch to the UK tenant (GBP)
2. Validate an invoice with currency_code="EUR"
3. Show me what happens with tax calculations
4. Tell me if this is supported or what errors I get
```

### Scenario: High Value Invoices

```
I need to test high-value invoice approval workflows. Can you:

1. Generate test invoices with scenario="HIGH_VALUE"
2. Validate they meet my requirements (>£10,000)
3. Show me the totals
4. Tell me if there are any validation concerns
```

---

## Comparison and Analysis Prompts

### Compare Mock vs Live Mode

```
What's the difference between mock mode and live mode? Call get_mcp_capabilities and explain:

1. What happens in each mode
2. When I should use each one
3. What credentials I need for live mode
4. What risks I should be aware of
```

### Compare Tax Systems

```

Compare the tax systems between Australian (GST), UK (VAT), and US tenants:

1. Call introspect_enums for TaxRate in each tenant
2. Show me the different tax types available
3. Explain the tax rates
4. Tell me what I need to consider for multi-region integrations
```

### Analyse Tool Responses

```
I got this response from validate_schema_match. Can you analyse it for me?

[PASTE THE RESPONSE JSON]

Tell me:
1. Whether it passed or failed
2. What the compliance score means
3. What warnings I should pay attention to
4. What I need to fix (if anything)
```

---

## Troubleshooting Prompts

### Fix "Account Not Found" Error

```

My invoice validation failed with "AccountCode not found". Can you help me fix it?

[PASTE YOUR INVOICE JSON]

1. Call introspect_enums to find valid revenue accounts
2. Tell me which account code I should use
3. Show me the corrected invoice payload
```

### Fix "Contact Not Found" Error

```
I got a "Contact not found" error. Can you:

1. List available contacts with list_contacts
2. Tell me which contact IDs I can use
3. Or show me how to create a new contact first
```

### Fix "Invalid Tax Type" Error

```

My validation failed with "TaxType is not valid for this region". Can you:

1. Tell me what tax types are valid for Australia/GST
2. Show me what tax types are valid for UK/VAT
3. Explain how to handle multi-region tax types
```

### Fix "Archived Account" Error

```

I got an error saying the account is ARCHIVED. Can you:

1. Call introspect_enums with filter for status="ACTIVE"
2. Show me only active revenue accounts
3. Tell me which account code I should use instead
```

---

## Complete Workflow Prompts

### End-to-End Invoice Workflow

```
Can you guide me through the complete invoice workflow from start to finish?

1. Show me available tenants
2. Select the Australian tenant
3. Show me valid accounts and contacts
4. Validate this invoice payload: [PASTE INVOICE]
5. Fix any validation errors
6. Create the invoice
7. Authorise it
8. Add a payment
9. Show me the final status

Explain each step as you go.
```

### End-to-End Quote Workflow

```

Walk me through creating and converting a quote to an invoice:

1. Create a quote for £5,000 of consulting services
2. Send the quote to the customer
3. Accept the quote on behalf of the customer
4. Convert it to an invoice
5. Show me the quote, invoice, and their relationships
```

### End-to-End Credit Note Workflow

```

I need to process a refund. Can you show me the full credit note workflow?

1. Create the original invoice first
2. Authorise it
3. Create a credit note for the refund
4. Allocate the credit note to the invoice
5. Show me the updated invoice balance and status
```

---

## Automation Prompts

### Automate Batch Validation

```

I have a folder of invoice JSON files. Can you help me validate all of them?

For each file:
1. Read the invoice payload
2. Call validate_schema_match
3. Tell me which ones pass and which ones fail
4. Summarise the results

[PASTE FILE LIST or DIRECTORY PATH]
```

### Automate Fixture Generation

```

I need test data for development. Can you:

1. Generate 20 invoices with scenario="OVERDUE_BILLS"
2. Generate 10 contacts
3. Show me the IDs that were created
4. Tell me how I can use these in my tests
```

### Automate Error Detection

```

I want to find all potential issues in my integration. Can you:

1. Validate invoices with different edge cases
2. Try invalid account codes, missing contacts, wrong tax types
3. Use simulate_network_conditions to test error handling
4. Give me a report of all issues found and their severity
```

---

## Quick Reference Prompts

### One-Liner Prompts

```
- Show me the available tenants.
- Switch to the UK tenant.
- List all active revenue accounts.
- List all customers (is_customer=true).
- Validate this invoice: [PASTE JSON]
- Create this contact: [PASTE JSON]
- Show me recent audit log entries.
- Simulate rate limiting for 60 seconds.
```

### Common Task Prompts

```
- I need to validate an invoice before creating it.
- What tax types are available for Australia?
- How do I handle multi-region tax compliance?
- Test my integration with network failures.
- Show me how to use idempotency keys.
- Generate test data for overdue invoices.
- Find out why my validation failed.
```

---

## I Want To...

- **Learn the basics** → [Getting Started Guide](getting-started.md)
- **See all tools** → [Tools Reference](tools-reference.md)
- **Learn workflows** → [Workflow Guide](workflows.md)
- **Fix issues** → [Troubleshooting](../reference/troubleshooting.md)

---

**← Back to:** [User Guide](index.md) | **↑ Up to:** [Documentation Home](../index.md)
