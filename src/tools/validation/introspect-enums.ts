import { z } from 'zod';
import type { XeroAdapter, Account, Contact, AccountFilter, ContactFilter } from '../../adapters/adapter-interface.js';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';

const FilterSchema = z.object({
  type: z.enum(['REVENUE', 'EXPENSE', 'BANK', 'CURRENT', 'FIXED', 'LIABILITY', 'EQUITY']).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  is_customer: z.boolean().optional(),
  is_supplier: z.boolean().optional(),
}).optional();

export const IntrospectEnumsSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  entity_type: z.enum(['Account', 'TaxRate', 'Contact']).describe('Type of entity to introspect'),
  filter: FilterSchema.describe('Optional filter criteria'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('compact'),
});

export type IntrospectEnumsArgs = z.infer<typeof IntrospectEnumsSchema>;

export const INTROSPECT_ENUMS_TOOL = {
  name: 'introspect_enums',
  description: `Get valid values for fields in the tenant's Xero configuration.

Use this to find:
- Valid AccountCodes for invoices (filtered by type: REVENUE, EXPENSE, etc.)
- Valid TaxTypes for the tenant's region (AU: OUTPUT, INPUT, EXEMPTOUTPUT, etc.)
- Valid ContactIDs for invoices

This is typically called after validate_schema_match fails, to find valid values.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Target tenant ID',
      },
      entity_type: {
        type: 'string',
        enum: ['Account', 'TaxRate', 'Contact'],
        description: 'Type of entity to introspect',
      },
      filter: {
        type: 'object',
        description: 'Optional filter criteria',
        properties: {
          type: {
            type: 'string',
            enum: ['REVENUE', 'EXPENSE', 'BANK', 'CURRENT', 'FIXED', 'LIABILITY', 'EQUITY'],
            description: 'Account type filter',
          },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'ARCHIVED'],
            description: 'Status filter',
          },
          is_customer: {
            type: 'boolean',
            description: 'Filter contacts by customer flag',
          },
          is_supplier: {
            type: 'boolean',
            description: 'Filter contacts by supplier flag',
          },
        },
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'compact',
      },
    },
    required: ['tenant_id', 'entity_type'],
  },
};

type AccountValue = { code: string; name: string; type: string; tax_type?: string | null };
type TaxRateValue = { tax_type: string; name: string; rate: number };
type ContactValue = { contact_id: string; name: string; email?: string };

interface IntrospectData {
  entity_type: string;
  count: number;
  values: AccountValue[] | TaxRateValue[] | ContactValue[];
  tenant_region?: string;
}

export async function handleIntrospectEnums(
  args: IntrospectEnumsArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<IntrospectData>> {
  const startTime = Date.now();
  const { tenant_id, entity_type, filter, verbosity } = args;

  try {
    const context = await adapter.getTenantContext(tenant_id);
    let values: AccountValue[] | TaxRateValue[] | ContactValue[];
    let narrative: string;

    switch (entity_type) {
      case 'Account': {
        const accountFilter: AccountFilter = {
          type: filter?.type as Account['type'] | undefined,
          status: filter?.status as Account['status'] | undefined,
        };
        const accounts = await adapter.getAccounts(tenant_id, accountFilter);
        values = accounts.map(a => ({
          code: a.code,
          name: a.name,
          type: a.type,
          tax_type: a.tax_type,
        }));
        narrative = `Found ${values.length} account(s)${filter?.type ? ` of type ${filter.type}` : ''}${filter?.status ? ` with status ${filter.status}` : ''}.`;
        break;
      }

      case 'TaxRate': {
        const taxRates = await adapter.getTaxRates(tenant_id);
        const activeTaxRates = taxRates.filter(t => t.status === 'ACTIVE');
        values = activeTaxRates.map(t => ({
          tax_type: t.tax_type,
          name: t.name,
          rate: t.rate,
        }));
        narrative = `Found ${values.length} active tax rate(s) for ${context.region} region. Use these tax_type values in your invoices.`;
        break;
      }

      case 'Contact': {
        const contactFilter: ContactFilter = {
          is_customer: filter?.is_customer,
          is_supplier: filter?.is_supplier,
          status: filter?.status as Contact['status'] | undefined,
        };
        const contacts = await adapter.getContacts(tenant_id, contactFilter);
        values = contacts.map(c => ({
          contact_id: c.contact_id,
          name: c.name,
          email: c.email,
        }));
        narrative = `Found ${values.length} contact(s)${filter?.is_customer ? ' (customers)' : ''}${filter?.is_supplier ? ' (suppliers)' : ''}.`;
        break;
      }

      default:
        throw new Error(`Unsupported entity type: ${entity_type}`);
    }

    const executionTimeMs = Date.now() - startTime;

    const response = createResponse({
      success: true,
      data: {
        entity_type,
        count: values.length,
        values,
        tenant_region: context.region,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs,
      narrative,
    });
    auditLogResponse(response, 'introspect_enums', tenant_id, executionTimeMs);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorResponse = createResponse({
      success: false,
      data: {
        entity_type,
        count: 0,
        values: [],
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Failed to introspect ${entity_type}: ${message}`,
      rootCause: message,
    });
    auditLogResponse(errorResponse, 'introspect_enums', tenant_id, Date.now() - startTime);
    return errorResponse;
  }
}
