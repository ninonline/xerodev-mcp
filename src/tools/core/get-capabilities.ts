import { z } from 'zod';
import type { XeroAdapter } from '../../adapters/adapter-interface.js';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';

export const GetCapabilitiesSchema = z.object({
  include_tenants: z.boolean().default(true).describe('Include list of available tenants'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic').describe('Response verbosity level'),
});

export type GetCapabilitiesArgs = z.infer<typeof GetCapabilitiesSchema>;

export const GET_CAPABILITIES_TOOL = {
  name: 'get_mcp_capabilities',
  description: `Returns server capabilities and AI agent guidelines.

**ALWAYS CALL THIS FIRST** before any other tool.

This tool returns:
- Current server mode (mock or live)
- Available tenants and their regions
- Required workflow for AI agents
- Rate limit information

Use this to understand the server state and plan your integration workflow.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      include_tenants: {
        type: 'boolean',
        description: 'Include list of available tenants',
        default: true,
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        description: 'Response verbosity level',
        default: 'diagnostic',
      },
    },
  },
};

interface CapabilitiesData {
  server: {
    name: string;
    version: string;
    mode: 'mock' | 'live';
  };
  guidelines: {
    workflow: string[];
    rules: string[];
  };
  available_tenants?: Array<{
    tenant_id: string;
    tenant_name: string;
    region: string;
    description: string;
  }>;
  rate_limits: {
    mode: string;
    backoff_enabled: boolean;
  };
  data_persistence: string;
}

export async function handleGetCapabilities(
  args: GetCapabilitiesArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<CapabilitiesData>> {
  const startTime = Date.now();
  const mode = adapter.getMode();

  let tenants: Array<{ tenant_id: string; tenant_name: string; region: string }> = [];
  if (args.include_tenants) {
    tenants = await adapter.getTenants();
  }

  const capabilities: CapabilitiesData = {
    server: {
      name: 'xerodev-mcp',
      version: '0.1.0',
      mode,
    },

    guidelines: {
      workflow: [
        '1. Call get_mcp_capabilities (this tool) to understand the server',
        '2. Call switch_tenant_context to select a tenant (if multiple available)',
        '3. Call validate_schema_match BEFORE any write operation',
        '4. Call introspect_enums to find valid AccountCodes and TaxTypes',
        '5. If validation passes, proceed with the actual write operation',
      ],
      rules: [
        'Always validate invoice payloads before creating them',
        'Check recovery.next_tool_call in error responses for suggested fixes',
        'Use verbosity="diagnostic" when debugging issues',
        'AccountCodes and TaxTypes vary by tenant region (AU, US, UK)',
      ],
    },

    available_tenants: args.include_tenants
      ? tenants.map(t => ({
          tenant_id: t.tenant_id,
          tenant_name: t.tenant_name,
          region: t.region,
          description: `${t.region} tenant - ${t.tenant_name}`,
        }))
      : undefined,

    rate_limits: {
      mode: mode === 'mock' ? 'unlimited' : '60 requests/minute per tenant (Xero limit)',
      backoff_enabled: true,
    },

    data_persistence: mode === 'mock'
      ? 'Data stored in test fixtures. Safe for testing without affecting real data.'
      : 'Data stored in real Xero. Changes are permanent.',
  };

  const executionTimeMs = Date.now() - startTime;

  return createResponse({
    success: true,
    data: capabilities,
    verbosity: args.verbosity as VerbosityLevel,
    executionTimeMs,
    narrative: `Server running in ${mode.toUpperCase()} mode. ${
      mode === 'mock'
        ? 'You can safely test without affecting real data.'
        : 'WARNING: Operations will affect real Xero data.'
    } Follow the workflow in guidelines.workflow for best results.`,
  });
}
