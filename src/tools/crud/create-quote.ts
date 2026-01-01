import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter } from '../../adapters/adapter-factory.js';
import { type Quote, type TaxRate } from '../../adapters/adapter-interface.js';
import { checkSimulation } from '../chaos/simulate-network.js';

const LineItemSchema = z.object({
  description: z.string().describe('Line item description'),
  quantity: z.number().positive().describe('Quantity'),
  unit_amount: z.number().describe('Unit price'),
  account_code: z.string().describe('Account code from Chart of Accounts'),
  tax_type: z.string().optional().describe('Tax type (e.g., OUTPUT, INPUT, EXEMPTOUTPUT)'),
});

export const CreateQuoteSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  contact_id: z.string().describe('Contact ID for the quote recipient'),
  line_items: z.array(LineItemSchema).min(1).describe('Line items (at least one required)'),
  date: z.string().optional().describe('Quote date (YYYY-MM-DD)'),
  expiry_date: z.string().optional().describe('Expiry date (YYYY-MM-DD)'),
  title: z.string().optional().describe('Quote title/subject'),
  summary: z.string().optional().describe('Quote summary'),
  terms: z.string().optional().describe('Terms and conditions'),
  idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type CreateQuoteArgs = z.infer<typeof CreateQuoteSchema>;

export const CREATE_QUOTE_TOOL = {
  name: 'create_quote',
  description: `Creates a new quote/proposal in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify ContactID exists: use introspect_enums with entity_type='Contact'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'
4. Validate payload: use validate_schema_match with entity_type='Quote'

**COMMON FAILURES:**
- AccountCode not found → Call introspect_enums with entity_type='Account'
- Invalid TaxType → AU uses OUTPUT/INPUT, check with introspect_enums entity_type='TaxRate'
- ContactID not found → Create contact first with create_contact
- Expiry date before quote date → Check date ordering

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.
If the same key is used twice, the second call returns the existing quote.

**QUOTE STATUSES:**
- DRAFT: Initial state, can be edited
- SENT: Sent to contact
- ACCEPTED: Contact accepted
- DECLINED: Contact declined
- INVOICED: Converted to invoice`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      contact_id: { type: 'string', description: 'Contact ID for the quote recipient' },
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
      date: { type: 'string', description: 'Quote date (YYYY-MM-DD)' },
      expiry_date: { type: 'string', description: 'Expiry date (YYYY-MM-DD)' },
      title: { type: 'string', description: 'Quote title/subject' },
      summary: { type: 'string', description: 'Quote summary' },
      terms: { type: 'string', description: 'Terms and conditions' },
      idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate creation' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'contact_id', 'line_items'],
  },
};

// In-memory idempotency store (keyed by idempotency_key)
const idempotencyStore = new Map<string, Quote>();

export async function handleCreateQuote(
  args: CreateQuoteArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<Quote | { error: string; details?: unknown }>> {
  const startTime = Date.now();
  const {
    tenant_id,
    contact_id,
    line_items,
    date,
    expiry_date,
    title,
    summary,
    terms,
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
    auditLogResponse(response, 'create_quote', tenant_id, Date.now() - startTime);
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
        narrative: `Idempotent replay: Returning existing quote ${existing.quote_number} created with same idempotency_key.`,
        executionTimeMs: Date.now() - startTime,
      });
      auditLogResponse(response, 'create_quote', tenant_id, Date.now() - startTime);
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
    auditLogResponse(response, 'create_quote', tenant_id, Date.now() - startTime);
    return response;
  }

  // Build quote payload
  const today = new Date().toISOString().split('T')[0];
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const quotePayload: Partial<Quote> = {
    quote_id: `quote-${Date.now()}-${randomUUID().substring(0, 8)}`,
    quote_number: `QU-${String(Date.now()).slice(-6)}`,
    contact: { contact_id },
    date: date || today,
    expiry_date: expiry_date || defaultExpiry,
    status: 'DRAFT',
    line_amount_types: 'Exclusive',
    line_items: line_items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit_amount: item.unit_amount,
      account_code: item.account_code,
      tax_type: item.tax_type || 'OUTPUT',
    })),
    currency_code: tenantContext.currency,
    title,
    summary,
    terms,
  };

  // Validate the quote
  const validation = await adapter.validateQuote(tenant_id, quotePayload);

  if (!validation.valid) {
    // Determine recovery action
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
            filter: { status: 'ACTIVE', type: 'REVENUE' },
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
        error: 'Quote validation failed',
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
          score: validation.score,
        },
      },
      verbosity: verbosity as VerbosityLevel,
      narrative: `Quote validation failed: ${validation.errors[0]}`,
      warnings: validation.warnings,
      recovery,
      executionTimeMs: Date.now() - startTime,
    });
    auditLogResponse(response, 'create_quote', tenant_id, Date.now() - startTime);
    return response;
  }

  // Calculate totals
  let subTotal = 0;
  for (const item of quotePayload.line_items!) {
    subTotal += item.quantity * item.unit_amount;
  }

  // Get tax rate for calculation
  const taxRates = await adapter.getTaxRates(tenant_id);
  const outputTax = taxRates.find((t: TaxRate) => t.tax_type === 'OUTPUT' && t.status === 'ACTIVE');
  const taxRate = outputTax?.rate || 10; // Default to 10% for AU

  const totalTax = subTotal * (taxRate / 100);

  quotePayload.sub_total = Math.round(subTotal * 100) / 100;
  quotePayload.total_tax = Math.round(totalTax * 100) / 100;
  quotePayload.total = Math.round((subTotal + totalTax) * 100) / 100;

  // Create the quote
  const createdQuote = await adapter.createQuote(tenant_id, quotePayload);

  // Store for idempotency
  if (idempotency_key) {
    idempotencyStore.set(idempotency_key, createdQuote);
  }

  const response = createResponse({
    success: true,
    data: createdQuote,
    verbosity: verbosity as VerbosityLevel,
    score: 1.0,
    narrative: `Created quote ${createdQuote.quote_number} for ${createdQuote.total} ${createdQuote.currency_code}. ` +
      `Status: DRAFT. Quote is ready to be sent to contact.`,
    warnings: validation.warnings,
    executionTimeMs: Date.now() - startTime,
  });
  auditLogResponse(response, 'create_quote', tenant_id, Date.now() - startTime);
  return response;
}

// Export for testing
export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}
