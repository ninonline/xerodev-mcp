import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import type { XeroAdapter } from '../../adapters/adapter-factory.js';

export const ListConnectionsSchema = z.object({
  include_inactive: z.boolean().default(false).describe('Include expired and revoked connections'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type ListConnectionsArgs = z.infer<typeof ListConnectionsSchema>;

export const LIST_CONNECTIONS_TOOL = {
  name: 'list_connections',
  description: `Lists all stored Xero tenant connections from the database.

**USE AFTER OAUTH:**
Call this after completing the OAuth flow to see all available connections.

**CONNECTION STATUSES:**
- active: Tokens are valid and ready to use
- expired: Tokens have expired and need refresh
- revoked: Connection has been removed

**WHAT THIS RETURNS:**
- List of all stored tenant connections
- Tenant ID, name, and region
- Connection status
- Granted OAuth scopes
- Creation and last sync timestamps

**NEXT STEPS:**
- Use a tenant_id from this list as the tenant_id parameter for other tools
- If status is 'expired', call \`refresh_connection\` to renew tokens`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      include_inactive: {
        type: 'boolean',
        default: false,
        description: 'Include expired and revoked connections in the list',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: [] as string[],
  },
};

interface ConnectionInfo {
  tenant_id: string;
  tenant_name: string;
  connection_status: 'active' | 'expired' | 'revoked';
  xero_region: string | null;
  granted_scopes: string[];
  created_at: string;
  last_synced_at: string | null;
}

export async function handleListConnections(
  args: ListConnectionsArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<{ connections: ConnectionInfo[] } | { error: string }>> {
  const startTime = Date.now();
  const { include_inactive, verbosity } = args;

  // This tool only works in live mode
  if (adapter.getMode() !== 'live') {
    const response = createResponse({
      success: false,
      data: { error: 'Connection listing is only available in live mode (MCP_MODE=live)' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The list_connections tool requires live mode. In mock mode, use get_mcp_capabilities to see available mock tenants.',
      recovery: {
        suggested_action_id: 'use_mock_capabilities',
        description: 'Call get_mcp_capabilities to see available mock tenants',
        next_tool_call: {
          name: 'get_mcp_capabilities',
          arguments: { include_tenants: true },
        },
      },
    });
    auditLogResponse(response, 'list_connections', null, Date.now() - startTime);
    return response;
  }

  // Get the live adapter
  const liveAdapter = adapter as any;
  if (typeof liveAdapter.getConnections !== 'function') {
    const response = createResponse({
      success: false,
      data: { error: 'Adapter does not support connection listing' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The current adapter configuration does not support connection listing.',
    });
    auditLogResponse(response, 'list_connections', null, Date.now() - startTime);
    return response;
  }

  try {
    const rawConnections = liveAdapter.getConnections();

    // Filter out inactive connections if requested
    const filteredConnections = include_inactive
      ? rawConnections
      : rawConnections.filter((c: any) => c.connection_status === 'active');

    // Format connections for response
    const connections: ConnectionInfo[] = filteredConnections.map((c: any) => ({
      tenant_id: c.tenant_id,
      tenant_name: c.tenant_name || 'Unknown Organisation',
      connection_status: c.connection_status,
      xero_region: c.xero_region,
      granted_scopes: JSON.parse(c.granted_scopes || '[]'),
      created_at: new Date(c.created_at * 1000).toISOString(),
      last_synced_at: c.last_synced_at ? new Date(c.last_synced_at * 1000).toISOString() : null,
    }));

    const activeCount = connections.filter((c: ConnectionInfo) => c.connection_status === 'active').length;
    const expiredCount = connections.filter((c: ConnectionInfo) => c.connection_status === 'expired').length;
    const revokedCount = connections.filter((c: ConnectionInfo) => c.connection_status === 'revoked').length;

    let narrative = `Found ${connections.length} connection(s).`;
    if (include_inactive) {
      narrative += ` Active: ${activeCount}, Expired: ${expiredCount}, Revoked: ${revokedCount}.`;
    }

    if (connections.length === 0) {
      narrative += ' No connections found. Complete the OAuth flow by calling get_authorization_url.';
      const response = createResponse({
        success: true,
        data: { connections: [] },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative,
        recovery: {
          suggested_action_id: 'start_oauth',
          description: 'Start the OAuth flow to create your first connection',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
      auditLogResponse(response, 'list_connections', null, Date.now() - startTime);
      return response;
    }

    const response = createResponse({
      success: true,
      data: { connections },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative,
    });
    auditLogResponse(response, 'list_connections', null, Date.now() - startTime);
    return response;
  } catch (error) {
    const response = createResponse({
      success: false,
      data: { error: error instanceof Error ? error.message : 'Unknown error listing connections' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'Failed to retrieve connections from the database.',
    });
    auditLogResponse(response, 'list_connections', null, Date.now() - startTime);
    return response;
  }
}
