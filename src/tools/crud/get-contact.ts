import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter, type Contact } from '../../adapters/adapter-factory.js';
import { checkSimulation } from '../chaos/simulate-network.js';

export const GetContactSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  contact_id: z.string().describe('Contact ID to fetch'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type GetContactArgs = z.infer<typeof GetContactSchema>;

export const GET_CONTACT_TOOL = {
  name: 'get_contact',
  description: `Fetches a single contact by ID from the Xero organisation.

**USE CASES:**
- Retrieve contact details before creating invoice
- Verify contact exists and is active
- Get contact addresses and phone numbers

**RETURNS:**
- Full contact details including name, email, addresses, phones
- Contact type (is_customer, is_supplier)
- Status (ACTIVE or ARCHIVED)

**IF NOT FOUND:**
- Returns error with recovery suggesting list_contacts to find valid IDs`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      contact_id: { type: 'string', description: 'Contact ID to fetch' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'contact_id'],
  },
};

interface GetContactResult {
  contact: Contact | null;
  found: boolean;
}

export async function handleGetContact(
  args: GetContactArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<GetContactResult | { error: string }>> {
  const startTime = Date.now();
  const { tenant_id, contact_id, verbosity } = args;

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
    auditLogResponse(response, 'get_contact', tenant_id, Date.now() - startTime);
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
    auditLogResponse(response, 'get_contact', tenant_id, Date.now() - startTime);
    return response;
  }

  // Fetch all contacts and find the one we need
  const contacts = await adapter.getContacts(tenant_id);
  const contact = contacts.find(c => c.contact_id === contact_id);

  if (!contact) {
    const response = createResponse({
      success: false,
      data: { error: `Contact '${contact_id}' not found in tenant ${tenant_id}` },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Contact '${contact_id}' not found. Use list_contacts to search for contacts.`,
      recovery: {
        suggested_action_id: 'list_contacts',
        description: 'List available contacts to find valid IDs',
        next_tool_call: {
          name: 'list_contacts',
          arguments: { tenant_id },
        },
      },
    });
    auditLogResponse(response, 'get_contact', tenant_id, Date.now() - startTime);
    return response;
  }

  const contactTypes: string[] = [];
  if (contact.is_customer) contactTypes.push('customer');
  if (contact.is_supplier) contactTypes.push('supplier');
  const typeLabel = contactTypes.length > 0 ? contactTypes.join('/') : 'contact';

  const response = createResponse({
    success: true,
    data: {
      contact,
      found: true,
    },
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative: `Found ${typeLabel} '${contact.name}' (${contact.status}). ` +
      `Email: ${contact.email || 'not set'}.`,
  });
  auditLogResponse(response, 'get_contact', tenant_id, Date.now() - startTime);
  return response;
}
