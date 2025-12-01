import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter } from '../../adapters/adapter-factory.js';
import { type CreditNote, type TaxRate } from '../../adapters/adapter-interface.js';
import { checkSimulation } from '../chaos/simulate-network.js';

const LineItemSchema = z.object({
  description: z.string().describe('Line item description'),
  quantity: z.number().positive().describe('Quantity'),
  unit_amount: z.number().describe('Unit price'),
  account_code: z.string().describe('Account code from Chart of Accounts'),
  tax_type: z.string().optional().describe('Tax type (e.g., OUTPUT, INPUT, EXEMPTOUTPUT)'),
});

export const CreateCreditNoteSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  type: z.enum(['ACCRECCREDIT', 'ACCPAYCREDIT']).describe('Credit note type'),
  contact_id: z.string().describe('Contact ID for the credit note'),
  line_items: z.array(LineItemSchema).min(1).describe('Line items (at least one required)'),
  date: z.string().optional().describe('Credit note date (YYYY-MM-DD)'),
  reference: z.string().optional().describe('Reference number'),
  idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type CreateCreditNoteArgs = z.infer<typeof CreateCreditNoteSchema>;

export const CREATE_CREDIT_NOTE_TOOL = {
  name: 'create_credit_note',
  description: `Creates a new credit note in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify ContactID exists: use introspect_enums with entity_type='Contact'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'
4. Validate payload: use validate_schema_match with entity_type='CreditNote'

**CREDIT NOTE TYPES:**
- ACCRECCREDIT: Accounts Receivable Credit (credit to customer)
- ACCPAYCREDIT: Accounts Payable Credit (credit from supplier)

**COMMON USES:**
- Refunds to customers
- Supplier credits for returns
- Billing corrections

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      type: {
        type: 'string',
        enum: ['ACCRECCREDIT', 'ACCPAYCREDIT'],
        description: 'Credit note type',
      },
      contact_id: { type: 'string', description: 'Contact ID for the credit note' },
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
      date: { type: 'string', description: 'Credit note date (YYYY-MM-DD)' },
      reference: { type: 'string', description: 'Reference number' },
      idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate creation' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'type', 'contact_id', 'line_items'],
  },
};

// In-memory idempotency store
const idempotencyStore = new Map<string, CreditNote>();

export async function handleCreateCreditNote(
  args: CreateCreditNoteArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<CreditNote | { error: string; details?: unknown }>> {
  const startTime = Date.now();
  const {
    tenant_id,
    type,
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
    return createResponse({
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
  }

  // Check idempotency
  if (idempotency_key) {
    const existing = idempotencyStore.get(idempotency_key);
    if (existing) {
      return createResponse({
        success: true,
        data: existing,
        verbosity: verbosity as VerbosityLevel,
        narrative: `Idempotent replay: Returning existing credit note ${existing.credit_note_number} created with same idempotency_key.`,
        executionTimeMs: Date.now() - startTime,
      });
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
    return createResponse({
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
  }

  // Build credit note payload
  const today = new Date().toISOString().split('T')[0];

  const creditNotePayload: Partial<CreditNote> = {
    credit_note_id: `cn-${Date.now()}-${randomUUID().substring(0, 8)}`,
    credit_note_number: `CN-${String(Date.now()).slice(-6)}`,
    type,
    contact: { contact_id },
    date: date || today,
    status: 'DRAFT',
    line_amount_types: 'Exclusive',
    line_items: line_items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit_amount: item.unit_amount,
      account_code: item.account_code,
      tax_type: item.tax_type || (type === 'ACCRECCREDIT' ? 'OUTPUT' : 'INPUT'),
    })),
    currency_code: tenantContext.currency,
    reference,
  };

  // Validate the credit note
  const validation = await adapter.validateCreditNote(tenant_id, creditNotePayload);

  if (!validation.valid) {
    let recovery: MCPResponse<unknown>['recovery'] = undefined;

    const hasAccountError = validation.errors.some((e: string) => e.includes('AccountCode') || e.includes('account_code'));
    const hasTaxError = validation.errors.some((e: string) => e.includes('TaxType') || e.includes('tax_type'));
    const hasContactError = validation.errors.some((e: string) => e.includes('Contact') || e.includes('contact'));

    if (hasAccountError) {
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

    return createResponse({
      success: false,
      data: {
        error: 'Credit note validation failed',
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
          score: validation.score,
        },
      },
      verbosity: verbosity as VerbosityLevel,
      narrative: `Credit note validation failed: ${validation.errors[0]}`,
      warnings: validation.warnings,
      recovery,
      executionTimeMs: Date.now() - startTime,
    });
  }

  // Calculate totals
  let subTotal = 0;
  for (const item of creditNotePayload.line_items!) {
    subTotal += item.quantity * item.unit_amount;
  }

  // Get tax rate for calculation
  const taxRates = await adapter.getTaxRates(tenant_id);
  const taxType = type === 'ACCRECCREDIT' ? 'OUTPUT' : 'INPUT';
  const applicableTax = taxRates.find((t: TaxRate) => t.tax_type === taxType && t.status === 'ACTIVE');
  const taxRate = applicableTax?.rate || 10;

  const totalTax = subTotal * (taxRate / 100);

  creditNotePayload.sub_total = Math.round(subTotal * 100) / 100;
  creditNotePayload.total_tax = Math.round(totalTax * 100) / 100;
  creditNotePayload.total = Math.round((subTotal + totalTax) * 100) / 100;
  creditNotePayload.remaining_credit = creditNotePayload.total;

  // Create the credit note
  const createdCreditNote = await adapter.createCreditNote(tenant_id, creditNotePayload);

  // Store for idempotency
  if (idempotency_key) {
    idempotencyStore.set(idempotency_key, createdCreditNote);
  }

  return createResponse({
    success: true,
    data: createdCreditNote,
    verbosity: verbosity as VerbosityLevel,
    score: 1.0,
    narrative: `Created credit note ${createdCreditNote.credit_note_number} for ${createdCreditNote.total} ${createdCreditNote.currency_code}. ` +
      `Type: ${type}. Status: DRAFT. Remaining credit: ${createdCreditNote.remaining_credit}.`,
    warnings: validation.warnings,
    executionTimeMs: Date.now() - startTime,
  });
}

// Export for testing
export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}
