#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { AdapterFactory, type XeroAdapter } from './adapters/adapter-factory.js';
import {
  GetCapabilitiesSchema,
  handleGetCapabilities,
} from './tools/core/get-capabilities.js';
import {
  SwitchTenantSchema,
  handleSwitchTenant,
} from './tools/core/switch-tenant.js';
import {
  ValidateSchemaSchema,
  handleValidateSchema,
} from './tools/validation/validate-schema.js';
import {
  IntrospectEnumsSchema,
  handleIntrospectEnums,
} from './tools/validation/introspect-enums.js';
import {
  DryRunSyncSchema,
  handleDryRunSync,
} from './tools/simulation/dry-run-sync.js';
import {
  SeedSandboxSchema,
  handleSeedSandbox,
} from './tools/simulation/seed-sandbox.js';
import {
  DriveLifecycleSchema,
  handleDriveLifecycle,
} from './tools/simulation/drive-lifecycle.js';
import {
  SimulateNetworkSchema,
  handleSimulateNetwork,
} from './tools/chaos/simulate-network.js';
import {
  ReplayIdempotencySchema,
  handleReplayIdempotency,
} from './tools/chaos/replay-idempotency.js';
import {
  CreateContactSchema,
  handleCreateContact,
} from './tools/crud/create-contact.js';
import {
  CreateInvoiceSchema,
  handleCreateInvoice,
} from './tools/crud/create-invoice.js';
import {
  GetAuditLogSchema,
  handleGetAuditLog,
} from './tools/core/get-audit-log.js';
import {
  CreateQuoteSchema,
  handleCreateQuote,
} from './tools/crud/create-quote.js';
import {
  CreateCreditNoteSchema,
  handleCreateCreditNote,
} from './tools/crud/create-credit-note.js';
import {
  CreatePaymentSchema,
  handleCreatePayment,
} from './tools/crud/create-payment.js';
import {
  CreateBankTransactionSchema,
  handleCreateBankTransaction,
} from './tools/crud/create-bank-transaction.js';
import {
  GetInvoiceSchema,
  handleGetInvoice,
} from './tools/crud/get-invoice.js';
import {
  GetContactSchema,
  handleGetContact,
} from './tools/crud/get-contact.js';
import {
  ListInvoicesSchema,
  handleListInvoices,
} from './tools/crud/list-invoices.js';
import {
  ListContactsSchema,
  handleListContacts,
} from './tools/crud/list-contacts.js';
import {
  GetAuthorizationUrlSchema,
  handleGetAuthorizationUrl,
} from './tools/oauth/get-authorization-url.js';
import {
  ExchangeAuthCodeSchema,
  handleExchangeAuthCode,
} from './tools/oauth/exchange-auth-code.js';
import {
  ListConnectionsSchema,
  handleListConnections,
} from './tools/oauth/list-connections.js';
import {
  RefreshConnectionSchema,
  handleRefreshConnection,
} from './tools/oauth/refresh-connection.js';
import {
  RevokeConnectionSchema,
  handleRevokeConnection,
} from './tools/oauth/revoke-connection.js';

const SERVER_NAME = 'xerodev-mcp';
const SERVER_VERSION = '0.1.0';

/**
 * Main entry point for the Xero Integration Foundry MCP Server.
 */
async function main(): Promise<void> {
  // Log to stderr (stdout is reserved for MCP protocol)
  console.error(`[${SERVER_NAME}] Starting v${SERVER_VERSION}...`);

  // Create adapter based on mode
  const mode = process.env.MCP_MODE ?? 'mock';
  console.error(`[${SERVER_NAME}] Mode: ${mode.toUpperCase()}`);

  let adapter: XeroAdapter;
  try {
    adapter = AdapterFactory.create(mode);
  } catch (error) {
    console.error(`[${SERVER_NAME}] Failed to create adapter:`, error);
    process.exit(1);
  }

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register get_mcp_capabilities tool
  server.tool(
    'get_mcp_capabilities',
    `Returns server capabilities and AI agent guidelines.

**ALWAYS CALL THIS FIRST** before any other tool.

This tool returns:
- Current server mode (mock or live)
- Available tenants and their regions
- Required workflow for AI agents
- Rate limit information`,
    {
      include_tenants: z.boolean().default(true).describe('Include list of available tenants'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic').describe('Response verbosity level'),
    },
    async (args) => {
      const parsed = GetCapabilitiesSchema.parse(args);
      const result = await handleGetCapabilities(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register switch_tenant_context tool
  server.tool(
    'switch_tenant_context',
    `Switch to a different Xero tenant/organisation.

Call this before performing operations if you need to work with a specific tenant.
Returns the tenant's configuration including region, currency, and available accounts.`,
    {
      tenant_id: z.string().describe('The tenant ID to switch to'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = SwitchTenantSchema.parse(args);
      const result = await handleSwitchTenant(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register validate_schema_match tool
  server.tool(
    'validate_schema_match',
    `Validates a payload against Xero's schema AND the tenant's specific configuration.

**This is the most important tool.** Call it before any write operation.

Returns:
- Structural validation (JSON schema compliance)
- Context validation (AccountCodes exist, TaxTypes valid for region)
- Compliance score (0.0 to 1.0)
- Detailed diff showing what's wrong
- Recovery suggestions with next_tool_call`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      entity_type: z.enum(['Invoice', 'Contact', 'Quote', 'CreditNote', 'Payment', 'BankTransaction']).describe('Type of entity to validate'),
      payload: z.any().describe('The payload to validate'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = ValidateSchemaSchema.parse(args);
      const result = await handleValidateSchema(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register introspect_enums tool
  server.tool(
    'introspect_enums',
    `Get valid values for fields in the tenant's Xero configuration.

Use this to find:
- Valid AccountCodes for invoices (filtered by type: REVENUE, EXPENSE, etc.)
- Valid TaxTypes for the tenant's region (AU: OUTPUT, INPUT, EXEMPTOUTPUT, etc.)
- Valid ContactIDs for invoices

This is typically called after validate_schema_match fails, to find valid values.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      entity_type: z.enum(['Account', 'TaxRate', 'Contact']).describe('Type of entity to introspect'),
      filter: z.object({
        type: z.enum(['REVENUE', 'EXPENSE', 'BANK', 'CURRENT', 'FIXED', 'LIABILITY', 'EQUITY']).optional(),
        status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
        is_customer: z.boolean().optional(),
        is_supplier: z.boolean().optional(),
      }).optional().describe('Optional filter criteria'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('compact'),
    },
    async (args) => {
      const parsed = IntrospectEnumsSchema.parse(args);
      const result = await handleIntrospectEnums(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register dry_run_sync tool
  server.tool(
    'dry_run_sync',
    `Simulates a batch operation without actually executing it.

Use this to:
- Test batch invoice creation before running for real
- Identify which payloads in a batch would fail
- Get estimated totals and counts
- Understand the impact of a batch operation

Returns validation results for each payload without modifying data.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      operation: z.enum(['create_invoices', 'create_contacts']).describe('Type of batch operation'),
      payloads: z.array(z.any()).min(1).max(50).describe('Array of payloads to simulate (max 50)'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = DryRunSyncSchema.parse(args);
      const result = await handleDryRunSync(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register seed_sandbox_data tool
  server.tool(
    'seed_sandbox_data',
    `Generates realistic test data for testing.

Use this when you need specific test scenarios:
- DEFAULT: Standard mix of data
- OVERDUE_BILLS: Invoices 30-90 days past due
- MIXED_STATUS: Mix of DRAFT, AUTHORISED, and PAID invoices
- HIGH_VALUE: Invoices with large amounts

Returns generated payloads you can use in subsequent tool calls.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      entity: z.enum(['CONTACTS', 'INVOICES']).describe('Type of entity to generate'),
      count: z.number().min(1).max(50).default(10).describe('Number of entities to generate'),
      scenario: z.enum(['DEFAULT', 'OVERDUE_BILLS', 'MIXED_STATUS', 'HIGH_VALUE']).default('DEFAULT'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = SeedSandboxSchema.parse(args);
      const result = await handleSeedSandbox(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register drive_lifecycle tool
  server.tool(
    'drive_lifecycle',
    `Transitions an entity through its lifecycle states.

Use this to test:
- Invoice approval workflows (DRAFT → AUTHORISED → PAID)
- Quote acceptance flows (DRAFT → SENT → ACCEPTED → INVOICED)
- Credit note processing

**INVOICE STATES:**
DRAFT → SUBMITTED → AUTHORISED → PAID (terminal)
Any state → VOIDED (except PAID)

**QUOTE STATES:**
DRAFT → SENT → ACCEPTED → INVOICED (terminal)
SENT/ACCEPTED → DECLINED
DECLINED → DRAFT (for re-editing)

**CREDIT NOTE STATES:**
DRAFT → SUBMITTED → AUTHORISED → PAID (terminal)
Any state → VOIDED (except PAID)

When transitioning to PAID, provide payment_amount and payment_account_id.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      entity_type: z.enum(['Invoice', 'Quote', 'CreditNote']).describe('Type of entity'),
      entity_id: z.string().describe('ID of the entity to transition'),
      target_state: z.string().describe('Target state to transition to'),
      payment_amount: z.number().optional().describe('Payment amount (for PAID transition)'),
      payment_account_id: z.string().optional().describe('Bank account ID (for PAID transition)'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = DriveLifecycleSchema.parse(args);
      const result = await handleDriveLifecycle(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register simulate_network_conditions tool
  server.tool(
    'simulate_network_conditions',
    `Simulates various network conditions to test integration resilience.

Use this to test how your integration handles:
- RATE_LIMIT: Simulates Xero's 60 requests/minute rate limit (429 responses)
- TIMEOUT: Simulates slow/hanging connections
- SERVER_ERROR: Simulates 500/502/503 errors
- TOKEN_EXPIRED: Simulates OAuth token expiration (401 responses)
- INTERMITTENT: Random failures at specified rate

The simulation affects subsequent tool calls for the specified duration.
Call with duration_seconds=0 to clear any active simulation.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      condition: z.enum(['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR', 'TOKEN_EXPIRED', 'INTERMITTENT'])
        .describe('Network condition to simulate'),
      duration_seconds: z.number().min(0).max(300).default(60)
        .describe('Duration in seconds (0 to clear, max 300)'),
      failure_rate: z.number().min(0).max(1).default(1.0)
        .describe('Probability of failure for INTERMITTENT condition'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = SimulateNetworkSchema.parse(args);
      const result = await handleSimulateNetwork(parsed);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register replay_idempotency tool
  server.tool(
    'replay_idempotency',
    `Tests idempotency behaviour by replaying the same request multiple times.

Use this to verify your integration correctly handles:
- Duplicate request detection
- Consistent response on replays
- Proper idempotency key usage

Returns a detailed report of each replay attempt and whether idempotency
was correctly maintained.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      operation: z.enum(['create_invoice', 'create_contact', 'create_payment'])
        .describe('Operation type to test idempotency for'),
      idempotency_key: z.string().optional()
        .describe('Optional key to use. If not provided, a new one is generated'),
      payload: z.any().describe('The payload to use for the operation'),
      replay_count: z.number().min(1).max(10).default(3)
        .describe('Number of times to replay the request'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = ReplayIdempotencySchema.parse(args);
      const result = await handleReplayIdempotency(parsed);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register create_contact tool
  server.tool(
    'create_contact',
    `Creates a new contact in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Validate payload: use validate_schema_match with entity_type='Contact'

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      name: z.string().min(1).describe('Contact name (required)'),
      email: z.string().optional().describe('Contact email address'),
      first_name: z.string().optional().describe('First name'),
      last_name: z.string().optional().describe('Last name'),
      phone: z.string().optional().describe('Phone number'),
      is_customer: z.boolean().default(true).describe('Whether this is a customer'),
      is_supplier: z.boolean().default(false).describe('Whether this is a supplier'),
      idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = CreateContactSchema.parse(args);
      const result = await handleCreateContact(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register create_invoice tool
  server.tool(
    'create_invoice',
    `Creates a new invoice in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify ContactID exists: use introspect_enums with entity_type='Contact'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'
4. Validate payload: use validate_schema_match with entity_type='Invoice'

**INVOICE TYPES:**
- ACCREC: Accounts Receivable (sales invoice - you send to customer)
- ACCPAY: Accounts Payable (bill - you receive from supplier)

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      type: z.enum(['ACCREC', 'ACCPAY']).describe('Invoice type'),
      contact_id: z.string().describe('Contact ID for the invoice'),
      line_items: z.array(z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unit_amount: z.number(),
        account_code: z.string(),
        tax_type: z.string().optional(),
      })).min(1).describe('Line items'),
      date: z.string().optional().describe('Invoice date (YYYY-MM-DD)'),
      due_date: z.string().optional().describe('Due date (YYYY-MM-DD)'),
      reference: z.string().optional().describe('Reference number'),
      status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED']).default('DRAFT'),
      idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = CreateInvoiceSchema.parse(args);
      const result = await handleCreateInvoice(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register create_quote tool
  server.tool(
    'create_quote',
    `Creates a new quote/proposal in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify ContactID exists: use introspect_enums with entity_type='Contact'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'
4. Validate payload: use validate_schema_match with entity_type='Quote'

**QUOTE STATUSES:**
- DRAFT: Initial state, can be edited
- SENT: Sent to contact
- ACCEPTED: Contact accepted
- DECLINED: Contact declined
- INVOICED: Converted to invoice

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      contact_id: z.string().describe('Contact ID for the quote recipient'),
      line_items: z.array(z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unit_amount: z.number(),
        account_code: z.string(),
        tax_type: z.string().optional(),
      })).min(1).describe('Line items'),
      date: z.string().optional().describe('Quote date (YYYY-MM-DD)'),
      expiry_date: z.string().optional().describe('Expiry date (YYYY-MM-DD)'),
      title: z.string().optional().describe('Quote title/subject'),
      summary: z.string().optional().describe('Quote summary'),
      terms: z.string().optional().describe('Terms and conditions'),
      idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = CreateQuoteSchema.parse(args);
      const result = await handleCreateQuote(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register create_credit_note tool
  server.tool(
    'create_credit_note',
    `Creates a new credit note in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify ContactID exists: use introspect_enums with entity_type='Contact'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'

**CREDIT NOTE TYPES:**
- ACCRECCREDIT: Accounts Receivable Credit (credit to customer)
- ACCPAYCREDIT: Accounts Payable Credit (credit from supplier)

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      type: z.enum(['ACCRECCREDIT', 'ACCPAYCREDIT']).describe('Credit note type'),
      contact_id: z.string().describe('Contact ID for the credit note'),
      line_items: z.array(z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unit_amount: z.number(),
        account_code: z.string(),
        tax_type: z.string().optional(),
      })).min(1).describe('Line items'),
      date: z.string().optional().describe('Credit note date (YYYY-MM-DD)'),
      reference: z.string().optional().describe('Reference number'),
      idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = CreateCreditNoteSchema.parse(args);
      const result = await handleCreateCreditNote(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register create_payment tool
  server.tool(
    'create_payment',
    `Creates a new payment in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify invoice or credit note exists
3. Verify bank account exists: use introspect_enums with entity_type='Account' and filter type='BANK'

**IMPORTANT:**
- Must specify either invoice_id OR credit_note_id (not both)
- Payment amount cannot exceed the remaining balance

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      invoice_id: z.string().optional().describe('Invoice ID to apply payment to'),
      credit_note_id: z.string().optional().describe('Credit note ID to refund'),
      account_id: z.string().describe('Bank account ID for the payment'),
      amount: z.number().positive().describe('Payment amount'),
      date: z.string().optional().describe('Payment date (YYYY-MM-DD)'),
      reference: z.string().optional().describe('Payment reference'),
      idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = CreatePaymentSchema.parse(args);
      const result = await handleCreatePayment(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register create_bank_transaction tool
  server.tool(
    'create_bank_transaction',
    `Creates a new bank transaction in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify bank account exists: use introspect_enums with entity_type='Account' and filter type='BANK'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'

**TRANSACTION TYPES:**
- RECEIVE: Money received (e.g., customer payment)
- SPEND: Money spent (e.g., supplier payment)
- RECEIVE-OVERPAYMENT: Overpayment received
- RECEIVE-PREPAYMENT: Prepayment received
- SPEND-OVERPAYMENT: Overpayment made
- SPEND-PREPAYMENT: Prepayment made

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      type: z.enum(['RECEIVE', 'SPEND', 'RECEIVE-OVERPAYMENT', 'RECEIVE-PREPAYMENT', 'SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT'])
        .describe('Transaction type'),
      bank_account_id: z.string().describe('Bank account ID'),
      contact_id: z.string().optional().describe('Contact ID (optional)'),
      line_items: z.array(z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unit_amount: z.number(),
        account_code: z.string(),
        tax_type: z.string().optional(),
      })).min(1).describe('Line items'),
      date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
      reference: z.string().optional().describe('Transaction reference'),
      idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = CreateBankTransactionSchema.parse(args);
      const result = await handleCreateBankTransaction(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register get_invoice tool
  server.tool(
    'get_invoice',
    `Fetches a single invoice by ID from the Xero organisation.

**USE CASES:**
- Retrieve invoice details after creation
- Check invoice status before applying payment
- Verify invoice totals and line items

**RETURNS:**
Full invoice details including contact, line items, totals, status, and currency.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      invoice_id: z.string().describe('Invoice ID to fetch'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = GetInvoiceSchema.parse(args);
      const result = await handleGetInvoice(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register get_contact tool
  server.tool(
    'get_contact',
    `Fetches a single contact by ID from the Xero organisation.

**USE CASES:**
- Retrieve contact details before creating invoice
- Verify contact exists and is active
- Get contact addresses and phone numbers

**RETURNS:**
Full contact details including name, email, addresses, phones, customer/supplier flags.`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      contact_id: z.string().describe('Contact ID to fetch'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = GetContactSchema.parse(args);
      const result = await handleGetContact(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register list_invoices tool
  server.tool(
    'list_invoices',
    `Lists invoices from the Xero organisation with optional filters.

**FILTERS:**
- status: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
- type: ACCREC (sales invoices) or ACCPAY (bills)
- contact_id: Filter by specific contact
- from_date/to_date: Date range (YYYY-MM-DD)

**PAGINATION:**
- page: Page number (starts at 1)
- page_size: Items per page (max 100, default 20)`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED']).optional()
        .describe('Filter by invoice status'),
      type: z.enum(['ACCREC', 'ACCPAY']).optional()
        .describe('Filter by invoice type'),
      contact_id: z.string().optional().describe('Filter by contact ID'),
      from_date: z.string().optional().describe('Filter from date (YYYY-MM-DD)'),
      to_date: z.string().optional().describe('Filter to date (YYYY-MM-DD)'),
      page: z.number().int().positive().default(1).describe('Page number'),
      page_size: z.number().int().positive().max(100).default(20).describe('Items per page'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = ListInvoicesSchema.parse(args);
      const result = await handleListInvoices(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register list_contacts tool
  server.tool(
    'list_contacts',
    `Lists contacts from the Xero organisation with optional filters.

**FILTERS:**
- status: ACTIVE or ARCHIVED
- is_customer: Filter to customers only
- is_supplier: Filter to suppliers only
- search: Search by name or email (case-insensitive)

**PAGINATION:**
- page: Page number (starts at 1)
- page_size: Items per page (max 100, default 20)`,
    {
      tenant_id: z.string().describe('Target tenant ID'),
      status: z.enum(['ACTIVE', 'ARCHIVED']).optional().describe('Filter by status'),
      is_customer: z.boolean().optional().describe('Filter to customers only'),
      is_supplier: z.boolean().optional().describe('Filter to suppliers only'),
      search: z.string().optional().describe('Search by name or email'),
      page: z.number().int().positive().default(1).describe('Page number'),
      page_size: z.number().int().positive().max(100).default(20).describe('Items per page'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = ListContactsSchema.parse(args);
      const result = await handleListContacts(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register get_audit_log tool
  server.tool(
    'get_audit_log',
    `Retrieves audit log entries for tool invocations.

Use this to:
- Debug issues by reviewing past tool calls
- Track success/failure rates
- Monitor usage patterns per tenant
- Identify problematic operations`,
    {
      tenant_id: z.string().optional().describe('Filter by tenant ID'),
      tool_name: z.string().optional().describe('Filter by tool name'),
      success: z.boolean().optional().describe('Filter by success status'),
      include_stats: z.boolean().default(true).describe('Include statistics summary'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum entries to return'),
      offset: z.number().min(0).default(0).describe('Offset for pagination'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = GetAuditLogSchema.parse(args);
      const result = await handleGetAuditLog(parsed);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register get_authorization_url tool (OAuth step 1)
  server.tool(
    'get_authorization_url',
    `Generates a Xero OAuth 2.0 authorization URL for the user to visit in their browser.

**STEP 1 OF OAUTH FLOW:**
Call this tool first to get the authorization URL, then visit it in your browser.

**WHAT HAPPENS NEXT:**
1. User visits the returned URL in a web browser
2. User logs into Xero (if not already logged in)
3. User selects which Xero organisation(s) to authorize
4. Xero redirects to the callback URL with an authorization code
5. User copies the full callback URL
6. User calls \`exchange_auth_code\` with the callback URL`,
    {
      scopes: z.array(z.string()).optional().describe('OAuth scopes to request'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = GetAuthorizationUrlSchema.parse(args);
      const result = await handleGetAuthorizationUrl(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register exchange_auth_code tool (OAuth step 2)
  server.tool(
    'exchange_auth_code',
    `Exchanges the OAuth authorization code (from callback URL) for access tokens and stores them securely.

**STEP 2 OF OAUTH FLOW:**
After calling \`get_authorization_url\` and completing authorization in the browser, call this with the callback URL.

**HOW TO GET THE CALLBACK URL:**
1. Visit the authorization URL from \`get_authorization_url\`
2. Log in to Xero and select organisations to authorize
3. After authorization, Xero redirects to your redirect URI
4. The URL in your browser bar is the callback URL - copy the entire URL
5. Pass that URL to this tool as \`callback_url\``,
    {
      callback_url: z.string().describe('The full callback URL from the browser after authorization'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = ExchangeAuthCodeSchema.parse(args);
      const result = await handleExchangeAuthCode(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register list_connections tool
  server.tool(
    'list_connections',
    `Lists all stored Xero tenant connections from the database.

**USE AFTER OAUTH:**
Call this after completing the OAuth flow to see all available connections.

**CONNECTION STATUSES:**
- active: Tokens are valid and ready to use
- expired: Tokens have expired and need refresh
- revoked: Connection has been removed`,
    {
      include_inactive: z.boolean().default(false).describe('Include expired and revoked connections'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = ListConnectionsSchema.parse(args);
      const result = await handleListConnections(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register refresh_connection tool
  server.tool(
    'refresh_connection',
    `Manually refreshes OAuth tokens for a stored connection.

**WHEN TO USE:**
- Token refresh is automatic during API calls
- Use this tool to manually refresh if you suspect tokens are stale
- Use after a connection is marked as 'expired'

**Note:** Token refresh happens automatically during normal API calls.`,
    {
      tenant_id: z.string().describe('The tenant ID to refresh tokens for'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = RefreshConnectionSchema.parse(args);
      const result = await handleRefreshConnection(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Register revoke_connection tool
  server.tool(
    'revoke_connection',
    `Removes a stored Xero tenant connection from the database.

**WHEN TO USE:**
- You want to disconnect a Xero organisation
- You need to re-authorize a connection (revoke then re-authorize)
- Cleaning up old/unused connections

**WARNING:**
This operation cannot be undone. After revoking, you must complete the OAuth flow again to reconnect.`,
    {
      tenant_id: z.string().describe('The tenant ID to revoke'),
      verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
    },
    async (args) => {
      const parsed = RevokeConnectionSchema.parse(args);
      const result = await handleRevokeConnection(parsed, adapter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Connect via stdio transport (for Docker MCP Toolkit compatibility)
  const transport = new StdioServerTransport();

  console.error(`[${SERVER_NAME}] Connecting to transport...`);

  await server.connect(transport);

  console.error(`[${SERVER_NAME}] Ready. Registered 21 tools:`);
  console.error(`  - get_mcp_capabilities`);
  console.error(`  - switch_tenant_context`);
  console.error(`  - validate_schema_match`);
  console.error(`  - introspect_enums`);
  console.error(`  - dry_run_sync`);
  console.error(`  - seed_sandbox_data`);
  console.error(`  - drive_lifecycle`);
  console.error(`  - simulate_network_conditions`);
  console.error(`  - replay_idempotency`);
  console.error(`  - create_contact`);
  console.error(`  - create_invoice`);
  console.error(`  - create_quote`);
  console.error(`  - create_credit_note`);
  console.error(`  - create_payment`);
  console.error(`  - create_bank_transaction`);
  console.error(`  - get_invoice`);
  console.error(`  - get_contact`);
  console.error(`  - list_invoices`);
  console.error(`  - list_contacts`);
  console.error(`  - get_audit_log`);
  console.error(`  - get_authorization_url`);
  console.error(`  - exchange_auth_code`);
  console.error(`  - list_connections`);
  console.error(`  - refresh_connection`);
  console.error(`  - revoke_connection`);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.error(`[${SERVER_NAME}] Received SIGINT, shutting down...`);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error(`[${SERVER_NAME}] Received SIGTERM, shutting down...`);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
