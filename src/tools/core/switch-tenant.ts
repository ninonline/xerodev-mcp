import { z } from 'zod';
import type { XeroAdapter, TenantContext } from '../../adapters/adapter-interface.js';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';

export const SwitchTenantSchema = z.object({
  tenant_id: z.string().describe('The tenant ID to switch to'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type SwitchTenantArgs = z.infer<typeof SwitchTenantSchema>;

export const SWITCH_TENANT_TOOL = {
  name: 'switch_tenant_context',
  description: `Switch to a different Xero tenant/organisation.

Call this before performing operations if you need to work with a specific tenant.
Returns the tenant's configuration including region, currency, and available accounts.

This is useful when:
- You have multiple tenants and need to select one
- You want to see the tenant's Chart of Accounts structure
- You need to understand the tenant's tax configuration`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'The tenant ID to switch to',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id'],
  },
};

interface SwitchTenantData {
  tenant_id: string;
  tenant_name: string;
  region: string;
  currency: string;
  accounts_count: number;
  tax_rates_count: number;
  contacts_count: number;
  account_types: string[];
  tax_types: string[];
}

// Global state for current tenant (in real implementation, this might be per-session)
let currentTenantId: string | null = null;

export function getCurrentTenantId(): string | null {
  return currentTenantId;
}

export async function handleSwitchTenant(
  args: SwitchTenantArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<SwitchTenantData>> {
  const startTime = Date.now();
  const { tenant_id, verbosity } = args;

  try {
    const context: TenantContext = await adapter.getTenantContext(tenant_id);

    // Update global state
    currentTenantId = tenant_id;

    // Collect unique values
    const accountTypes = [...new Set(context.accounts.map(a => a.type))];
    const taxTypes = [...new Set(context.tax_rates.filter(t => t.status === 'ACTIVE').map(t => t.tax_type))];

    const data: SwitchTenantData = {
      tenant_id: context.tenant_id,
      tenant_name: context.tenant_name,
      region: context.region,
      currency: context.currency,
      accounts_count: context.accounts.length,
      tax_rates_count: context.tax_rates.length,
      contacts_count: context.contacts.length,
      account_types: accountTypes,
      tax_types: taxTypes,
    };

    const executionTimeMs = Date.now() - startTime;

    return createResponse({
      success: true,
      data,
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs,
      narrative: `Switched to tenant '${context.tenant_name}' (${context.region}). ` +
        `This tenant has ${context.accounts.length} accounts, ${context.tax_rates.length} tax rates, and ${context.contacts.length} contacts. ` +
        `Valid tax types: ${taxTypes.join(', ')}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createResponse({
      success: false,
      data: {
        tenant_id,
        tenant_name: '',
        region: '',
        currency: '',
        accounts_count: 0,
        tax_rates_count: 0,
        contacts_count: 0,
        account_types: [],
        tax_types: [],
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Failed to switch to tenant '${tenant_id}': ${message}`,
      rootCause: message,
      recovery: {
        suggested_action_id: 'list_tenants',
        description: 'Check available tenants',
        next_tool_call: {
          name: 'get_mcp_capabilities',
          arguments: { include_tenants: true },
        },
      },
    });
  }
}
