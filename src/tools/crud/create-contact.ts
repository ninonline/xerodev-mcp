import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter } from '../../adapters/adapter-factory.js';
import { checkSimulation } from '../chaos/simulate-network.js';

export const CreateContactSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  name: z.string().min(1).describe('Contact name (required)'),
  email: z.string().email().optional().describe('Contact email address'),
  first_name: z.string().optional().describe('First name'),
  last_name: z.string().optional().describe('Last name'),
  phone: z.string().optional().describe('Phone number'),
  is_customer: z.boolean().default(true).describe('Whether this is a customer'),
  is_supplier: z.boolean().default(false).describe('Whether this is a supplier'),
  idempotency_key: z.string().optional().describe('Unique key to prevent duplicate creation'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type CreateContactArgs = z.infer<typeof CreateContactSchema>;

export const CREATE_CONTACT_TOOL = {
  name: 'create_contact',
  description: `Creates a new contact in the Xero organisation.

**PREREQUISITES** (call these first):
1. Switch to tenant: use switch_tenant_context
2. Validate payload: use validate_schema_match with entity_type='Contact'

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.
If the same key is used twice, the second call returns the existing contact.

**FIELDS:**
- name (required): Contact/company name
- email: Email address
- first_name, last_name: Individual contact details
- is_customer: Mark as a customer (default: true)
- is_supplier: Mark as a supplier (default: false)`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      name: { type: 'string', description: 'Contact name (required)' },
      email: { type: 'string', description: 'Contact email address' },
      first_name: { type: 'string', description: 'First name' },
      last_name: { type: 'string', description: 'Last name' },
      phone: { type: 'string', description: 'Phone number' },
      is_customer: { type: 'boolean', default: true, description: 'Whether this is a customer' },
      is_supplier: { type: 'boolean', default: false, description: 'Whether this is a supplier' },
      idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate creation' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'name'],
  },
};

// Store for idempotency (in production, this would be in the database)
const contactIdempotencyStore: Map<string, ContactData> = new Map();

interface ContactData {
  contact_id: string;
  name: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  is_customer: boolean;
  is_supplier: boolean;
  status: 'ACTIVE';
  created_at: string;
}

interface CreateContactResult {
  contact: ContactData;
  was_duplicate: boolean;
}

export async function handleCreateContact(
  args: CreateContactArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<CreateContactResult>> {
  const startTime = Date.now();
  const {
    tenant_id,
    name,
    email,
    first_name,
    last_name,
    phone,
    is_customer,
    is_supplier,
    idempotency_key,
    verbosity,
  } = args;

  // Check for active network simulation
  const simCheck = checkSimulation(tenant_id);
  if (simCheck.shouldFail && simCheck.error) {
    const response = createResponse({
      success: false,
      data: {
        contact: {} as ContactData,
        was_duplicate: false,
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
    auditLogResponse(response, 'create_contact', tenant_id, Date.now() - startTime);
    return response;
  }

  // Check idempotency
  if (idempotency_key) {
    const existing = contactIdempotencyStore.get(idempotency_key);
    if (existing) {
      const response = createResponse({
        success: true,
        data: {
          contact: existing,
          was_duplicate: true,
        },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: `Contact already exists with this idempotency key. Returning existing contact ${existing.contact_id}.`,
        warnings: ['Duplicate request detected - returning cached result'],
      });
      auditLogResponse(response, 'create_contact', tenant_id, Date.now() - startTime);
      return response;
    }
  }

  // Verify tenant exists
  const tenants = await adapter.getTenants();
  const tenant = tenants.find(t => t.tenant_id === tenant_id);
  if (!tenant) {
    const response = createResponse({
      success: false,
      data: {
        contact: {} as ContactData,
        was_duplicate: false,
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
    auditLogResponse(response, 'create_contact', tenant_id, Date.now() - startTime);
    return response;
  }

  // Create the contact via adapter (mock or live)
  const createdContact = await adapter.createContact(tenant_id, {
    name,
    email,
    first_name,
    last_name,
    phone,
    is_customer,
    is_supplier,
  });

  const contact: ContactData = {
    contact_id: createdContact.contact_id,
    name: createdContact.name,
    email: createdContact.email,
    first_name: createdContact.first_name,
    last_name: createdContact.last_name,
    phone: createdContact.phone,
    is_customer: createdContact.is_customer ?? true,
    is_supplier: createdContact.is_supplier ?? false,
    status: (createdContact.status || 'ACTIVE') as 'ACTIVE',
    created_at: createdContact.created_at || new Date().toISOString(),
  };

  // Store for idempotency
  if (idempotency_key) {
    contactIdempotencyStore.set(idempotency_key, contact);
  }

  const executionTimeMs = Date.now() - startTime;
  const response = createResponse({
    success: true,
    data: {
      contact,
      was_duplicate: false,
    },
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs,
    narrative: `Created contact '${name}' with ID ${contact.contact_id}. ` +
      `Contact is ${is_customer ? 'a customer' : ''}${is_customer && is_supplier ? ' and ' : ''}${is_supplier ? 'a supplier' : ''}.`,
  });
  auditLogResponse(response, 'create_contact', tenant_id, executionTimeMs);
  return response;
}

// Exported for testing
export function clearContactIdempotencyStore(): void {
  contactIdempotencyStore.clear();
}

export function getContactFromIdempotencyStore(key: string): ContactData | undefined {
  return contactIdempotencyStore.get(key);
}
