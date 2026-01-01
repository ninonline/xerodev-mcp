import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter, type Contact, type ContactFilter } from '../../adapters/adapter-factory.js';
import { checkSimulation } from '../chaos/simulate-network.js';

export const ListContactsSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional().describe('Filter by contact status'),
  is_customer: z.boolean().optional().describe('Filter to only customers'),
  is_supplier: z.boolean().optional().describe('Filter to only suppliers'),
  search: z.string().optional().describe('Search by name or email (case-insensitive)'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  page_size: z.number().int().positive().max(100).default(20).describe('Items per page (max 100, default: 20)'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type ListContactsArgs = z.infer<typeof ListContactsSchema>;

export const LIST_CONTACTS_TOOL = {
  name: 'list_contacts',
  description: `Lists contacts from the Xero organisation with optional filters.

**FILTERS:**
- status: ACTIVE or ARCHIVED
- is_customer: true to filter to customers only
- is_supplier: true to filter to suppliers only
- search: Search by name or email (case-insensitive partial match)

**PAGINATION:**
- page: Page number (starts at 1)
- page_size: Items per page (max 100, default 20)

**USE CASES:**
- Find contacts for creating invoices
- Search for a specific customer or supplier
- List all active customers
- Find contact IDs for filtering invoices`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      status: {
        type: 'string',
        enum: ['ACTIVE', 'ARCHIVED'],
        description: 'Filter by contact status',
      },
      is_customer: { type: 'boolean', description: 'Filter to only customers' },
      is_supplier: { type: 'boolean', description: 'Filter to only suppliers' },
      search: { type: 'string', description: 'Search by name or email' },
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

interface ListContactsResult {
  contacts: Contact[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  filters_applied: string[];
}

export async function handleListContacts(
  args: ListContactsArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<ListContactsResult | { error: string }>> {
  const startTime = Date.now();
  const {
    tenant_id,
    status,
    is_customer,
    is_supplier,
    search,
    page = 1,
    page_size = 20,
    verbosity
  } = args;

  // Check for active network simulation
  const simCheck = checkSimulation(tenant_id);
  if (simCheck.shouldFail && simCheck.error) {
    const response = createResponse({
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
    auditLogResponse(response, 'list_contacts', tenant_id, Date.now() - startTime);
    return response;
  }

  // Verify tenant exists
  try {
    await adapter.getTenantContext(tenant_id);
  } catch {
    const response = createResponse({
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
    auditLogResponse(response, 'list_contacts', tenant_id, Date.now() - startTime);
    return response;
  }

  // Build filter
  const filter: ContactFilter = {};
  const filtersApplied: string[] = [];

  if (status) {
    filter.status = status;
    filtersApplied.push(`status=${status}`);
  }
  if (is_customer !== undefined) {
    filter.is_customer = is_customer;
    filtersApplied.push(`is_customer=${is_customer}`);
  }
  if (is_supplier !== undefined) {
    filter.is_supplier = is_supplier;
    filtersApplied.push(`is_supplier=${is_supplier}`);
  }

  // Fetch contacts from adapter
  let contacts = await adapter.getContacts(tenant_id, filter);

  // Apply status filter (in case adapter doesn't support it)
  if (status) {
    contacts = contacts.filter(c => c.status === status);
  }

  // Apply is_customer filter (in case adapter doesn't support it)
  if (is_customer !== undefined) {
    contacts = contacts.filter(c => c.is_customer === is_customer);
  }

  // Apply is_supplier filter (in case adapter doesn't support it)
  if (is_supplier !== undefined) {
    contacts = contacts.filter(c => c.is_supplier === is_supplier);
  }

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase();
    contacts = contacts.filter(c =>
      c.name.toLowerCase().includes(searchLower) ||
      (c.email && c.email.toLowerCase().includes(searchLower)) ||
      (c.first_name && c.first_name.toLowerCase().includes(searchLower)) ||
      (c.last_name && c.last_name.toLowerCase().includes(searchLower))
    );
    filtersApplied.push(`search="${search}"`);
  }

  const totalCount = contacts.length;
  const totalPages = Math.ceil(totalCount / page_size);

  // Apply pagination
  const startIndex = (page - 1) * page_size;
  const paginatedContacts = contacts.slice(startIndex, startIndex + page_size);

  // Calculate summary stats
  const customerCount = paginatedContacts.filter(c => c.is_customer).length;
  const supplierCount = paginatedContacts.filter(c => c.is_supplier).length;
  const activeCount = paginatedContacts.filter(c => c.status === 'ACTIVE').length;

  const filterSummary = filtersApplied.length > 0
    ? `Filters: ${filtersApplied.join(', ')}. `
    : '';

  const response = createResponse({
    success: true,
    data: {
      contacts: paginatedContacts,
      total_count: totalCount,
      page,
      page_size,
      total_pages: totalPages,
      filters_applied: filtersApplied,
    },
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative: `Found ${totalCount} contact(s). ${filterSummary}` +
      `Showing page ${page} of ${totalPages} (${paginatedContacts.length} items). ` +
      `Active: ${activeCount}, Customers: ${customerCount}, Suppliers: ${supplierCount}.`,
  });
  auditLogResponse(response, 'list_contacts', tenant_id, Date.now() - startTime);
  return response;
}
