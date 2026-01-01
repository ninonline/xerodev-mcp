import { z } from 'zod';
import type { XeroAdapter, Contact } from '../../adapters/adapter-interface.js';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';

export const UpdateContactSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  contact_id: z.string().describe('ID of the contact to update'),
  name: z.string().optional().describe('Contact name (organisation or person)'),
  email: z.string().optional().describe('Email address'),
  first_name: z.string().optional().describe('First name (for individuals)'),
  last_name: z.string().optional().describe('Last name (for individuals)'),
  phone: z.string().optional().describe('Phone number'),
  is_customer: z.boolean().optional().describe('Whether this is a customer'),
  is_supplier: z.boolean().optional().describe('Whether this is a supplier'),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional().describe('Contact status'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type UpdateContactArgs = z.infer<typeof UpdateContactSchema>;

export const UPDATE_CONTACT_TOOL = {
  name: 'update_contact',
  description: `Updates an existing contact in Xero.

**PREREQUISITES:**
- Verify contact_id exists: use list_contacts or get_contact
- The contact must exist in the tenant

**COMMON UPDATES:**
- Change contact name or email
- Update customer/supplier roles
- Add or modify contact details
- Archive a contact by setting status to 'ARCHIVED'

**BEHAVIOR:**
- Only fields provided will be updated
- Unprovided fields remain unchanged
- contact_id cannot be changed
- Returns the updated contact with all fields

**IDEMPOTENCY:**
This operation modifies data directly and is not idempotent.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Target tenant ID',
      },
      contact_id: {
        type: 'string',
        description: 'ID of the contact to update',
      },
      name: {
        type: 'string',
        description: 'Contact name (organisation or person)',
      },
      email: {
        type: 'string',
        description: 'Email address',
      },
      first_name: {
        type: 'string',
        description: 'First name (for individuals)',
      },
      last_name: {
        type: 'string',
        description: 'Last name (for individuals)',
      },
      phone: {
        type: 'string',
        description: 'Phone number',
      },
      is_customer: {
        type: 'boolean',
        description: 'Whether this is a customer',
      },
      is_supplier: {
        type: 'boolean',
        description: 'Whether this is a supplier',
      },
      status: {
        type: 'string',
        enum: ['ACTIVE', 'ARCHIVED'],
        description: 'Contact status',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'contact_id'],
  },
};

interface UpdateContactData {
  contact: Contact;
  updated_fields: string[];
}

export async function handleUpdateContact(
  args: UpdateContactArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<UpdateContactData>> {
  const startTime = Date.now();
  const { tenant_id, contact_id, verbosity, ...updates } = args;

  // Build list of fields being updated
  const updatedFields = Object.keys(updates).filter(key => updates[key as keyof typeof updates] !== undefined);

  try {
    // Perform the update
    const updatedContact = await adapter.updateContact(
      tenant_id,
      contact_id,
      updates as Partial<Omit<Contact, 'contact_id'>>
    );

    const executionTimeMs = Date.now() - startTime;

    const data: UpdateContactData = {
      contact: updatedContact,
      updated_fields: updatedFields,
    };

    const response = createResponse({
      success: true,
      data,
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs,
      narrative: `Updated contact '${updatedContact.name}' (${contact_id}). ` +
        `Modified ${updatedFields.length} field(s): ${updatedFields.join(', ')}.`,
    });
    auditLogResponse(response, 'update_contact', tenant_id, executionTimeMs);
    return response;
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a "not found" error
    const isNotFound = message.includes('not found');

    const errorResponse = createResponse({
      success: false,
      data: {
        contact: {} as Contact,
        updated_fields: [],
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs,
      narrative: `Failed to update contact: ${message}`,
      rootCause: message,
      recovery: isNotFound ? {
        suggested_action_id: 'list_contacts',
        description: 'List all contacts to find valid contact IDs',
        next_tool_call: {
          name: 'list_contacts',
          arguments: { tenant_id },
        },
      } : undefined,
    });
    auditLogResponse(errorResponse, 'update_contact', tenant_id, executionTimeMs);
    return errorResponse;
  }
}
