import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter } from '../../adapters/adapter-factory.js';
import { type BankTransaction, type TaxRate } from '../../adapters/adapter-interface.js';
import { checkSimulation } from '../chaos/simulate-network.js';

const LineItemSchema = z.object({
  description: z.string().describe('Line item description'),
  quantity: z.number().positive().describe('Quantity'),
  unit_amount: z.number().describe('Unit price'),
  account_code: z.string().describe('Account code from Chart of Accounts'),
  tax_type: z.string().optional().describe('Tax type (e.g., OUTPUT, INPUT, EXEMPTOUTPUT)'),
});

export const CreateBankTransactionSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  type: z.enum(['RECEIVE', 'SPEND', 'RECEIVE-OVERPAYMENT', 'RECEIVE-PREPAYMENT', 'SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT'])
    .describe('Transaction type'),
  bank_account_id: z.string().describe('Bank account ID'),
  contact_id: z.string().optional().describe('Contact ID (optional for some transaction types)'),
  line_items: z.array(LineItemSchema).min(1).describe('Line items (at least one required)'),
  date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
  reference: z.string().optional().describe('Transaction reference'),
  idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type CreateBankTransactionArgs = z.infer<typeof CreateBankTransactionSchema>;

export const CREATE_BANK_TRANSACTION_TOOL = {
  name: 'create_bank_transaction',
  description: `Creates a new bank transaction in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify bank account exists: use introspect_enums with entity_type='Account' and filter type='BANK'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'
4. (Optional) Verify ContactID: use introspect_enums with entity_type='Contact'

**TRANSACTION TYPES:**
- RECEIVE: Money received (e.g., customer payment)
- SPEND: Money spent (e.g., supplier payment)
- RECEIVE-OVERPAYMENT: Overpayment received from customer
- RECEIVE-PREPAYMENT: Prepayment received from customer
- SPEND-OVERPAYMENT: Overpayment made to supplier
- SPEND-PREPAYMENT: Prepayment made to supplier

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      type: {
        type: 'string',
        enum: ['RECEIVE', 'SPEND', 'RECEIVE-OVERPAYMENT', 'RECEIVE-PREPAYMENT', 'SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT'],
        description: 'Transaction type',
      },
      bank_account_id: { type: 'string', description: 'Bank account ID' },
      contact_id: { type: 'string', description: 'Contact ID (optional)' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_amount: { type: 'number' },
            account_code: { type: 'string' },
            tax_type: { type: 'string' },
          },
          required: ['description', 'quantity', 'unit_amount', 'account_code'],
        },
        description: 'Line items (at least one required)',
      },
      date: { type: 'string', description: 'Transaction date (YYYY-MM-DD)' },
      reference: { type: 'string', description: 'Transaction reference' },
      idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate creation' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'type', 'bank_account_id', 'line_items'],
  },
};

// In-memory idempotency store
const idempotencyStore = new Map<string, BankTransaction>();

export async function handleCreateBankTransaction(
  args: CreateBankTransactionArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<BankTransaction | { error: string; details?: unknown }>> {
  const startTime = Date.now();
  const {
    tenant_id,
    type,
    bank_account_id,
    contact_id,
    line_items,
    date,
    reference,
    idempotency_key,
    verbosity = 'diagnostic',
  } = args;

  // Check for active network simulation
  const simCheck = checkSimulation(tenant_id);
  if (simCheck.shouldFail && simCheck.error) {
    const response = createResponse({
      success: false,
      data: { error: simCheck.error.message },
      verbosity: verbosity as VerbosityLevel,
      narrative: `Request failed due to simulated ${simCheck.error.type} condition. ` +
        simCheck.error.message,
      recovery: {
        suggested_action_id: 'clear_simulation',
        description: 'Clear the network simulation to proceed',
        next_tool_call: {
          name: 'simulate_network_conditions',
          arguments: { tenant_id, condition: simCheck.error.type, duration_seconds: 0 },
        },
      },
      executionTimeMs: Date.now() - startTime,
    });
    auditLogResponse(response, 'create_bank_transaction', tenant_id, Date.now() - startTime);
    return response;
  }

  // Check idempotency
  if (idempotency_key) {
    const existing = idempotencyStore.get(idempotency_key);
    if (existing) {
      const response = createResponse({
        success: true,
        data: existing,
        verbosity: verbosity as VerbosityLevel,
        narrative: `Idempotent replay: Returning existing bank transaction ${existing.bank_transaction_id} created with same idempotency_key.`,
        executionTimeMs: Date.now() - startTime,
      });
      auditLogResponse(response, 'create_bank_transaction', tenant_id, Date.now() - startTime);
      return response;
    }
  }

  // Get tenant context
  let tenantContext;
  try {
    tenantContext = await adapter.getTenantContext(tenant_id);
  } catch {
    // Adapter throws for non-existent tenants
  }
  if (!tenantContext) {
    const response = createResponse({
      success: false,
      data: { error: `Tenant '${tenant_id}' not found` },
      verbosity: verbosity as VerbosityLevel,
      narrative: `Tenant '${tenant_id}' not found. Use get_mcp_capabilities to list available tenants.`,
      recovery: {
        suggested_action_id: 'list_tenants',
        description: 'List available tenants',
        next_tool_call: {
          name: 'get_mcp_capabilities',
          arguments: { include_tenants: true },
        },
      },
      executionTimeMs: Date.now() - startTime,
    });
    auditLogResponse(response, 'create_bank_transaction', tenant_id, Date.now() - startTime);
    return response;
  }

  // Determine default tax type based on transaction type
  const defaultTaxType = type.startsWith('RECEIVE') ? 'OUTPUT' : 'INPUT';

  // Build bank transaction payload
  const today = new Date().toISOString().split('T')[0];

  const transactionPayload: Partial<BankTransaction> = {
    bank_transaction_id: `bt-${Date.now()}-${randomUUID().substring(0, 8)}`,
    type,
    contact: contact_id ? { contact_id } : undefined,
    bank_account: { account_id: bank_account_id },
    date: date || today,
    status: 'DRAFT',
    line_amount_types: 'Exclusive',
    line_items: line_items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit_amount: item.unit_amount,
      account_code: item.account_code,
      tax_type: item.tax_type || defaultTaxType,
    })),
    currency_code: tenantContext.currency,
    reference,
    is_reconciled: false,
  };

  // Validate the bank transaction
  const validation = await adapter.validateBankTransaction(tenant_id, transactionPayload);

  if (!validation.valid) {
    let recovery: MCPResponse<unknown>['recovery'] = undefined;

    const hasBankAccountError = validation.errors.some((e: string) => e.includes('bank_account') || e.includes('Bank account'));
    const hasAccountError = validation.errors.some((e: string) => e.includes('account_code') || e.includes('AccountCode'));
    const hasTaxError = validation.errors.some((e: string) => e.includes('tax_type') || e.includes('TaxType'));
    const hasContactError = validation.errors.some((e: string) => e.includes('contact') || e.includes('Contact'));

    if (hasBankAccountError) {
      recovery = {
        suggested_action_id: 'find_bank_accounts',
        description: 'Search for valid bank accounts',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: {
            tenant_id,
            entity_type: 'Account',
            filter: { status: 'ACTIVE', type: 'BANK' },
          },
        },
      };
    } else if (hasAccountError) {
      recovery = {
        suggested_action_id: 'find_valid_account_codes',
        description: 'Search for valid account codes in the tenant Chart of Accounts',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: {
            tenant_id,
            entity_type: 'Account',
            filter: { status: 'ACTIVE' },
          },
        },
      };
    } else if (hasTaxError) {
      recovery = {
        suggested_action_id: 'find_valid_tax_types',
        description: 'Get valid tax types for this tenant region',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: {
            tenant_id,
            entity_type: 'TaxRate',
            filter: { status: 'ACTIVE' },
          },
        },
      };
    } else if (hasContactError) {
      recovery = {
        suggested_action_id: 'find_or_create_contact',
        description: 'Search for existing contacts or create a new one',
        next_tool_call: {
          name: 'create_contact',
          arguments: { tenant_id, name: 'New Contact' },
        },
      };
    }

    const response = createResponse({
      success: false,
      data: {
        error: 'Bank transaction validation failed',
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
          score: validation.score,
        },
      },
      verbosity: verbosity as VerbosityLevel,
      narrative: `Bank transaction validation failed: ${validation.errors[0]}`,
      warnings: validation.warnings,
      recovery,
      executionTimeMs: Date.now() - startTime,
    });
    auditLogResponse(response, 'create_bank_transaction', tenant_id, Date.now() - startTime);
    return response;
  }

  // Calculate totals
  let subTotal = 0;
  for (const item of transactionPayload.line_items!) {
    subTotal += item.quantity * item.unit_amount;
  }

  // Get tax rate for calculation
  const taxRates = await adapter.getTaxRates(tenant_id);
  const applicableTax = taxRates.find((t: TaxRate) => t.tax_type === defaultTaxType && t.status === 'ACTIVE');
  const taxRate = applicableTax?.rate || 10;

  const totalTax = subTotal * (taxRate / 100);

  transactionPayload.sub_total = Math.round(subTotal * 100) / 100;
  transactionPayload.total_tax = Math.round(totalTax * 100) / 100;
  transactionPayload.total = Math.round((subTotal + totalTax) * 100) / 100;

  // Create the bank transaction
  const createdTransaction = await adapter.createBankTransaction(tenant_id, transactionPayload);

  // Store for idempotency
  if (idempotency_key) {
    idempotencyStore.set(idempotency_key, createdTransaction);
  }

  const response = createResponse({
    success: true,
    data: createdTransaction,
    verbosity: verbosity as VerbosityLevel,
    score: 1.0,
    narrative: `Created ${type} bank transaction for ${createdTransaction.total} ${createdTransaction.currency_code}. ` +
      `Status: DRAFT. Transaction is not yet reconciled.`,
    warnings: validation.warnings,
    executionTimeMs: Date.now() - startTime,
  });
  auditLogResponse(response, 'create_bank_transaction', tenant_id, Date.now() - startTime);
  return response;
}

// Export for testing
export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}
