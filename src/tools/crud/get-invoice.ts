import { z } from 'zod';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter, type Invoice } from '../../adapters/adapter-factory.js';
import { checkSimulation } from '../chaos/simulate-network.js';

export const GetInvoiceSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  invoice_id: z.string().describe('Invoice ID to fetch'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type GetInvoiceArgs = z.infer<typeof GetInvoiceSchema>;

export const GET_INVOICE_TOOL = {
  name: 'get_invoice',
  description: `Fetches a single invoice by ID from the Xero organisation.

**USE CASES:**
- Retrieve invoice details after creation
- Check invoice status before applying payment
- Verify invoice totals and line items

**RETURNS:**
- Full invoice details including contact, line items, totals
- Invoice status (DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED)
- Currency and tax information

**IF NOT FOUND:**
- Returns error with recovery suggesting list_invoices to find valid IDs`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      invoice_id: { type: 'string', description: 'Invoice ID to fetch' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'invoice_id'],
  },
};

interface GetInvoiceResult {
  invoice: Invoice | null;
  found: boolean;
}

export async function handleGetInvoice(
  args: GetInvoiceArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<GetInvoiceResult | { error: string }>> {
  const startTime = Date.now();
  const { tenant_id, invoice_id, verbosity } = args;

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

  // Fetch all invoices and find the one we need
  const invoices = await adapter.getInvoices(tenant_id);
  const invoice = invoices.find(i => i.invoice_id === invoice_id);

  if (!invoice) {
    return createResponse({
      success: false,
      data: { error: `Invoice '${invoice_id}' not found in tenant ${tenant_id}` },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Invoice '${invoice_id}' not found. Use list_invoices to search for invoices.`,
      recovery: {
        suggested_action_id: 'list_invoices',
        description: 'List available invoices to find valid IDs',
        next_tool_call: {
          name: 'list_invoices',
          arguments: { tenant_id },
        },
      },
    });
  }

  const typeLabel = invoice.type === 'ACCREC' ? 'sales invoice' : 'bill';

  return createResponse({
    success: true,
    data: {
      invoice,
      found: true,
    },
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative: `Found ${typeLabel} ${invoice.invoice_id} with status ${invoice.status}. ` +
      `Total: ${invoice.currency_code || 'N/A'} ${invoice.total?.toFixed(2) || '0.00'}. Due: ${invoice.due_date || 'N/A'}.`,
  });
}
