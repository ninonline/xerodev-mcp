import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter } from '../../adapters/adapter-factory.js';
import { checkSimulation } from '../chaos/simulate-network.js';

const LineItemSchema = z.object({
  description: z.string().describe('Line item description'),
  quantity: z.number().positive().describe('Quantity'),
  unit_amount: z.number().describe('Unit price'),
  account_code: z.string().describe('Account code from Chart of Accounts'),
  tax_type: z.string().optional().describe('Tax type (e.g., OUTPUT, INPUT, EXEMPTOUTPUT)'),
});

export const CreateInvoiceSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  type: z.enum(['ACCREC', 'ACCPAY']).describe('Invoice type: ACCREC (receivable) or ACCPAY (payable)'),
  contact_id: z.string().describe('Contact ID for the invoice'),
  line_items: z.array(LineItemSchema).min(1).describe('Line items (at least one required)'),
  date: z.string().optional().describe('Invoice date (YYYY-MM-DD)'),
  due_date: z.string().optional().describe('Due date (YYYY-MM-DD)'),
  reference: z.string().optional().describe('Reference number'),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED']).default('DRAFT').describe('Invoice status'),
  idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type CreateInvoiceArgs = z.infer<typeof CreateInvoiceSchema>;

export const CREATE_INVOICE_TOOL = {
  name: 'create_invoice',
  description: `Creates a new invoice in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Verify ContactID exists: use introspect_enums with entity_type='Contact'
3. Verify AccountCodes exist: use introspect_enums with entity_type='Account'
4. Validate payload: use validate_schema_match with entity_type='Invoice'

**COMMON FAILURES:**
- AccountCode not found → Call introspect_enums with entity_type='Account'
- Invalid TaxType → AU uses OUTPUT/INPUT, check with introspect_enums entity_type='TaxRate'
- ContactID not found → Create contact first with create_contact

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.
If the same key is used twice, the second call returns the existing invoice.

**INVOICE TYPES:**
- ACCREC: Accounts Receivable (sales invoice - you send to customer)
- ACCPAY: Accounts Payable (bill - you receive from supplier)`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      type: {
        type: 'string',
        enum: ['ACCREC', 'ACCPAY'],
        description: 'Invoice type: ACCREC (receivable) or ACCPAY (payable)',
      },
      contact_id: { type: 'string', description: 'Contact ID for the invoice' },
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
      date: { type: 'string', description: 'Invoice date (YYYY-MM-DD)' },
      due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      reference: { type: 'string', description: 'Reference number' },
      status: {
        type: 'string',
        enum: ['DRAFT', 'SUBMITTED', 'AUTHORISED'],
        default: 'DRAFT',
        description: 'Invoice status',
      },
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

// Store for idempotency (in production, this would be in the database)
const invoiceIdempotencyStore: Map<string, InvoiceData> = new Map();

interface LineItem {
  description: string;
  quantity: number;
  unit_amount: number;
  account_code: string;
  tax_type?: string;
  line_amount: number;
}

interface InvoiceData {
  invoice_id: string;
  invoice_number: string;
  type: 'ACCREC' | 'ACCPAY';
  contact: {
    contact_id: string;
  };
  date: string;
  due_date: string;
  reference?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED';
  line_items: LineItem[];
  sub_total: number;
  total_tax: number;
  total: number;
  currency_code: string;
  created_at: string;
}

interface CreateInvoiceResult {
  invoice: InvoiceData;
  was_duplicate: boolean;
  validation_passed: boolean;
}

export async function handleCreateInvoice(
  args: CreateInvoiceArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<CreateInvoiceResult>> {
  const startTime = Date.now();
  const {
    tenant_id,
    type,
    contact_id,
    line_items,
    date,
    due_date,
    reference,
    status,
    idempotency_key,
    verbosity,
  } = args;

  // Check for active network simulation
  const simCheck = checkSimulation(tenant_id);
  if (simCheck.shouldFail && simCheck.error) {
    return createResponse({
      success: false,
      data: {
        invoice: {} as InvoiceData,
        was_duplicate: false,
        validation_passed: false,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
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
    });
  }

  // Check idempotency
  if (idempotency_key) {
    const existing = invoiceIdempotencyStore.get(idempotency_key);
    if (existing) {
      return createResponse({
        success: true,
        data: {
          invoice: existing,
          was_duplicate: true,
          validation_passed: true,
        },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: `Invoice already exists with this idempotency key. Returning existing invoice ${existing.invoice_id}.`,
        warnings: ['Duplicate request detected - returning cached result'],
      });
    }
  }

  // Verify tenant exists and get full context
  let tenantContext;
  try {
    tenantContext = await adapter.getTenantContext(tenant_id);
  } catch {
    return createResponse({
      success: false,
      data: {
        invoice: {} as InvoiceData,
        was_duplicate: false,
        validation_passed: false,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Tenant '${tenant_id}' not found. Use get_mcp_capabilities to list available tenants.`,
      recovery: {
        suggested_action_id: 'list_tenants',
        next_tool_call: {
          name: 'get_mcp_capabilities',
          arguments: { include_tenants: true },
        },
      },
    });
  }

  // Validate contact exists
  const contacts = await adapter.getContacts(tenant_id);
  const contact = contacts.find(c => c.contact_id === contact_id);
  if (!contact) {
    return createResponse({
      success: false,
      data: {
        invoice: {} as InvoiceData,
        was_duplicate: false,
        validation_passed: false,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Contact '${contact_id}' not found in tenant ${tenant_id}. ` +
        `Use introspect_enums to find valid contacts, or create_contact to create a new one.`,
      recovery: {
        suggested_action_id: 'find_contacts',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: { tenant_id, entity_type: 'Contact' },
        },
      },
    });
  }

  // Validate account codes
  const accounts = await adapter.getAccounts(tenant_id);
  const validationErrors: string[] = [];

  for (let i = 0; i < line_items.length; i++) {
    const item = line_items[i];
    const account = accounts.find(a => a.code === item.account_code);
    if (!account) {
      validationErrors.push(`Line item ${i + 1}: Account code '${item.account_code}' not found`);
    } else if (account.status === 'ARCHIVED') {
      validationErrors.push(`Line item ${i + 1}: Account code '${item.account_code}' is ARCHIVED`);
    }
  }

  if (validationErrors.length > 0) {
    return createResponse({
      success: false,
      data: {
        invoice: {} as InvoiceData,
        was_duplicate: false,
        validation_passed: false,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Invoice validation failed: ${validationErrors.join('; ')}. ` +
        `Use introspect_enums to find valid account codes.`,
      recovery: {
        suggested_action_id: 'find_accounts',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: {
            tenant_id,
            entity_type: 'Account',
            filter: { status: 'ACTIVE' },
          },
        },
      },
    });
  }

  // Calculate totals
  const invoiceDate = date || new Date().toISOString().split('T')[0];
  const invoiceDueDate = due_date || calculateDueDate(invoiceDate, 30);

  const processedLineItems: LineItem[] = line_items.map(item => ({
    description: item.description,
    quantity: item.quantity,
    unit_amount: item.unit_amount,
    account_code: item.account_code,
    tax_type: item.tax_type,
    line_amount: item.quantity * item.unit_amount,
  }));

  const subTotal = processedLineItems.reduce((sum, item) => sum + item.line_amount, 0);
  const taxRate = 0.1; // 10% GST for AU
  const totalTax = Math.round(subTotal * taxRate * 100) / 100;
  const total = subTotal + totalTax;

  // Create invoice number
  const invoicePrefix = type === 'ACCREC' ? 'INV' : 'BILL';
  const invoiceNumber = `${invoicePrefix}-${randomUUID().substring(0, 6).toUpperCase()}`;

  const invoice: InvoiceData = {
    invoice_id: `invoice-${randomUUID().substring(0, 8)}`,
    invoice_number: invoiceNumber,
    type,
    contact: { contact_id },
    date: invoiceDate,
    due_date: invoiceDueDate,
    reference,
    status,
    line_items: processedLineItems,
    sub_total: subTotal,
    total_tax: totalTax,
    total,
    currency_code: tenantContext.currency,
    created_at: new Date().toISOString(),
  };

  // Store for idempotency
  if (idempotency_key) {
    invoiceIdempotencyStore.set(idempotency_key, invoice);
  }

  const typeLabel = type === 'ACCREC' ? 'sales invoice' : 'bill';

  return createResponse({
    success: true,
    data: {
      invoice,
      was_duplicate: false,
      validation_passed: true,
    },
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative: `Created ${typeLabel} ${invoice.invoice_number} for ${tenantContext.currency} ${total.toFixed(2)}. ` +
      `Status: ${status}. Due: ${invoiceDueDate}.`,
  });
}

function calculateDueDate(date: string, daysToAdd: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + daysToAdd);
  return d.toISOString().split('T')[0];
}

// Exported for testing
export function clearInvoiceIdempotencyStore(): void {
  invoiceIdempotencyStore.clear();
}

export function getInvoiceFromIdempotencyStore(key: string): InvoiceData | undefined {
  return invoiceIdempotencyStore.get(key);
}
