import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter } from '../../adapters/adapter-factory.js';
import { type Payment } from '../../adapters/adapter-interface.js';
import { checkSimulation } from '../chaos/simulate-network.js';

export const CreatePaymentSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  invoice_id: z.string().optional().describe('Invoice ID to apply payment to'),
  credit_note_id: z.string().optional().describe('Credit note ID to refund'),
  account_id: z.string().describe('Bank account ID for the payment'),
  amount: z.number().positive().describe('Payment amount'),
  date: z.string().optional().describe('Payment date (YYYY-MM-DD)'),
  reference: z.string().optional().describe('Payment reference'),
  idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type CreatePaymentArgs = z.infer<typeof CreatePaymentSchema>;

export const CREATE_PAYMENT_TOOL = {
  name: 'create_payment',
  description: `Creates a new payment in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify invoice or credit note exists
3. Verify bank account exists: use introspect_enums with entity_type='Account' and filter type='BANK'

**PAYMENT TYPES:**
- Invoice payment: Apply payment to an invoice (reduces amount due)
- Credit note refund: Refund a credit note to the customer

**IMPORTANT:**
- Must specify either invoice_id OR credit_note_id (not both)
- Payment amount cannot exceed the remaining balance

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      invoice_id: { type: 'string', description: 'Invoice ID to apply payment to' },
      credit_note_id: { type: 'string', description: 'Credit note ID to refund' },
      account_id: { type: 'string', description: 'Bank account ID for the payment' },
      amount: { type: 'number', description: 'Payment amount' },
      date: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
      reference: { type: 'string', description: 'Payment reference' },
      idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate creation' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'account_id', 'amount'],
  },
};

// In-memory idempotency store
const idempotencyStore = new Map<string, Payment>();

export async function handleCreatePayment(
  args: CreatePaymentArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<Payment | { error: string; details?: unknown }>> {
  const startTime = Date.now();
  const {
    tenant_id,
    invoice_id,
    credit_note_id,
    account_id,
    amount,
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
    auditLogResponse(response, 'create_payment', tenant_id, Date.now() - startTime);
    return response;
  }

  // Validate that either invoice_id or credit_note_id is provided (but not both)
  if (!invoice_id && !credit_note_id) {
    const response = createResponse({
      success: false,
      data: { error: 'Must specify either invoice_id or credit_note_id' },
      verbosity: verbosity as VerbosityLevel,
      narrative: 'Payment must be applied to either an invoice or a credit note.',
      executionTimeMs: Date.now() - startTime,
    });
    auditLogResponse(response, 'create_payment', tenant_id, Date.now() - startTime);
    return response;
  }

  if (invoice_id && credit_note_id) {
    const response = createResponse({
      success: false,
      data: { error: 'Cannot specify both invoice_id and credit_note_id' },
      verbosity: verbosity as VerbosityLevel,
      narrative: 'Payment can only be applied to one of invoice or credit note, not both.',
      executionTimeMs: Date.now() - startTime,
    });
    auditLogResponse(response, 'create_payment', tenant_id, Date.now() - startTime);
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
        narrative: `Idempotent replay: Returning existing payment ${existing.payment_id} created with same idempotency_key.`,
        executionTimeMs: Date.now() - startTime,
      });
      auditLogResponse(response, 'create_payment', tenant_id, Date.now() - startTime);
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
    auditLogResponse(response, 'create_payment', tenant_id, Date.now() - startTime);
    return response;
  }

  // Build payment payload
  const today = new Date().toISOString().split('T')[0];

  const paymentPayload: Partial<Payment> = {
    payment_id: `pay-${Date.now()}-${randomUUID().substring(0, 8)}`,
    invoice: invoice_id ? { invoice_id } : undefined,
    credit_note: credit_note_id ? { credit_note_id } : undefined,
    account: { account_id },
    date: date || today,
    amount,
    currency_code: tenantContext.currency,
    reference,
    status: 'AUTHORISED',
  };

  // Validate the payment
  const validation = await adapter.validatePayment(tenant_id, paymentPayload);

  if (!validation.valid) {
    let recovery: MCPResponse<unknown>['recovery'] = undefined;

    const hasAccountError = validation.errors.some((e: string) => e.includes('account') || e.includes('Account'));
    const hasInvoiceError = validation.errors.some((e: string) => e.includes('invoice') || e.includes('Invoice'));

    if (hasAccountError) {
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
    } else if (hasInvoiceError) {
      recovery = {
        suggested_action_id: 'check_invoice',
        description: 'Verify the invoice exists and is payable',
        next_tool_call: {
          name: 'validate_schema_match',
          arguments: {
            tenant_id,
            entity_type: 'Invoice',
            payload: { invoice_id },
          },
        },
      };
    }

    const response = createResponse({
      success: false,
      data: {
        error: 'Payment validation failed',
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
          score: validation.score,
        },
      },
      verbosity: verbosity as VerbosityLevel,
      narrative: `Payment validation failed: ${validation.errors[0]}`,
      warnings: validation.warnings,
      recovery,
      executionTimeMs: Date.now() - startTime,
    });
    auditLogResponse(response, 'create_payment', tenant_id, Date.now() - startTime);
    return response;
  }

  // Create the payment
  const createdPayment = await adapter.createPayment(tenant_id, paymentPayload);

  // Store for idempotency
  if (idempotency_key) {
    idempotencyStore.set(idempotency_key, createdPayment);
  }

  const targetDescription = invoice_id
    ? `invoice ${invoice_id}`
    : `credit note ${credit_note_id}`;

  const response = createResponse({
    success: true,
    data: createdPayment,
    verbosity: verbosity as VerbosityLevel,
    score: 1.0,
    narrative: `Created payment of ${createdPayment.amount} ${createdPayment.currency_code} to ${targetDescription}. ` +
      `Status: AUTHORISED. Payment has been applied.`,
    warnings: validation.warnings,
    executionTimeMs: Date.now() - startTime,
  });
  auditLogResponse(response, 'create_payment', tenant_id, Date.now() - startTime);
  return response;
}

// Export for testing
export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}
