import { z } from 'zod';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter, type Invoice, type InvoiceFilter } from '../../adapters/adapter-factory.js';
import { checkSimulation } from '../chaos/simulate-network.js';

export const ListInvoicesSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED']).optional()
    .describe('Filter by invoice status'),
  type: z.enum(['ACCREC', 'ACCPAY']).optional()
    .describe('Filter by invoice type: ACCREC (sales) or ACCPAY (bills)'),
  contact_id: z.string().optional().describe('Filter by contact ID'),
  from_date: z.string().optional().describe('Filter invoices from this date (YYYY-MM-DD)'),
  to_date: z.string().optional().describe('Filter invoices up to this date (YYYY-MM-DD)'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  page_size: z.number().int().positive().max(100).default(20).describe('Items per page (max 100, default: 20)'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type ListInvoicesArgs = z.infer<typeof ListInvoicesSchema>;

export const LIST_INVOICES_TOOL = {
  name: 'list_invoices',
  description: `Lists invoices from the Xero organisation with optional filters.

**FILTERS:**
- status: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
- type: ACCREC (sales invoices) or ACCPAY (bills/payables)
- contact_id: Filter by specific contact
- from_date/to_date: Date range filter (YYYY-MM-DD)

**PAGINATION:**
- page: Page number (starts at 1)
- page_size: Items per page (max 100, default 20)

**USE CASES:**
- Find invoices to apply payments
- Review outstanding invoices
- Search for invoices by contact
- List all AUTHORISED invoices ready for payment`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      status: {
        type: 'string',
        enum: ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED'],
        description: 'Filter by invoice status',
      },
      type: {
        type: 'string',
        enum: ['ACCREC', 'ACCPAY'],
        description: 'Filter by invoice type',
      },
      contact_id: { type: 'string', description: 'Filter by contact ID' },
      from_date: { type: 'string', description: 'Filter from date (YYYY-MM-DD)' },
      to_date: { type: 'string', description: 'Filter to date (YYYY-MM-DD)' },
      page: { type: 'number', description: 'Page number (default: 1)' },
      page_size: { type: 'number', description: 'Items per page (max 100, default: 20)' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id'],
  },
};

interface ListInvoicesResult {
  invoices: Invoice[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  filters_applied: string[];
}

export async function handleListInvoices(
  args: ListInvoicesArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<ListInvoicesResult | { error: string }>> {
  const startTime = Date.now();
  const {
    tenant_id,
    status,
    type,
    contact_id,
    from_date,
    to_date,
    page = 1,
    page_size = 20,
    verbosity
  } = args;

  // Check for active network simulation
  const simCheck = checkSimulation(tenant_id);
  if (simCheck.shouldFail && simCheck.error) {
    return createResponse({
      success: false,
      data: { error: `Simulated ${simCheck.error.type}: ${simCheck.error.message}` },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Request failed due to simulated ${simCheck.error.type} condition.`,
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

  // Verify tenant exists
  try {
    await adapter.getTenantContext(tenant_id);
  } catch {
    return createResponse({
      success: false,
      data: { error: `Tenant '${tenant_id}' not found` },
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

  // Build filter
  const filter: InvoiceFilter = {};
  const filtersApplied: string[] = [];

  if (status) {
    filter.status = status;
    filtersApplied.push(`status=${status}`);
  }
  if (contact_id) {
    filter.contact_id = contact_id;
    filtersApplied.push(`contact_id=${contact_id}`);
  }
  if (from_date) {
    filter.from_date = from_date;
    filtersApplied.push(`from_date=${from_date}`);
  }
  if (to_date) {
    filter.to_date = to_date;
    filtersApplied.push(`to_date=${to_date}`);
  }

  // Fetch invoices from adapter
  let invoices = await adapter.getInvoices(tenant_id, filter);

  // Apply type filter (not in adapter filter)
  if (type) {
    invoices = invoices.filter(i => i.type === type);
    filtersApplied.push(`type=${type}`);
  }

  // Apply date range filters (adapter may not support these)
  if (from_date) {
    invoices = invoices.filter(i => i.date >= from_date);
  }
  if (to_date) {
    invoices = invoices.filter(i => i.date <= to_date);
  }

  // Apply status filter (adapter may return all)
  if (status) {
    invoices = invoices.filter(i => i.status === status);
  }

  // Apply contact filter (adapter may return all)
  if (contact_id) {
    invoices = invoices.filter(i => i.contact.contact_id === contact_id);
  }

  const totalCount = invoices.length;
  const totalPages = Math.ceil(totalCount / page_size);

  // Apply pagination
  const startIndex = (page - 1) * page_size;
  const paginatedInvoices = invoices.slice(startIndex, startIndex + page_size);

  // Calculate summary stats
  const totalValue = paginatedInvoices.reduce((sum, inv) => sum + inv.total, 0);

  const filterSummary = filtersApplied.length > 0
    ? `Filters: ${filtersApplied.join(', ')}. `
    : '';

  return createResponse({
    success: true,
    data: {
      invoices: paginatedInvoices,
      total_count: totalCount,
      page,
      page_size,
      total_pages: totalPages,
      filters_applied: filtersApplied,
    },
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative: `Found ${totalCount} invoice(s). ${filterSummary}` +
      `Showing page ${page} of ${totalPages} (${paginatedInvoices.length} items). ` +
      `Page total: ${paginatedInvoices.length > 0 ? paginatedInvoices[0].currency_code : ''} ${totalValue.toFixed(2)}.`,
  });
}
