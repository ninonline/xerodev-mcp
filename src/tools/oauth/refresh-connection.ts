import { z } from 'zod';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import type { XeroAdapter } from '../../adapters/adapter-factory.js';

export const RefreshConnectionSchema = z.object({
  tenant_id: z.string().describe('The tenant ID to refresh tokens for'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type RefreshConnectionArgs = z.infer<typeof RefreshConnectionSchema>;

export const REFRESH_CONNECTION_TOOL = {
  name: 'refresh_connection',
  description: `Manually refreshes OAuth tokens for a stored connection.

**WHEN TO USE:**
- Token refresh is automatic during API calls
- Use this tool to manually refresh if you suspect tokens are stale
- Use after a connection is marked as 'expired'

**WHAT THIS DOES:**
1. Uses the stored refresh token to get new access/refresh tokens from Xero
2. Updates the encrypted tokens in the database
3. Resets the connection status to 'active'

**Note:** Token refresh happens automatically during normal API calls. This manual refresh is optional.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'The tenant ID to refresh tokens for',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id'] as string[],
  },
};

export async function handleRefreshConnection(
  args: RefreshConnectionArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<{ tenant_id: string; refreshed: boolean; message: string } | { error: string }>> {
  const startTime = Date.now();
  const { tenant_id, verbosity } = args;

  // This tool only works in live mode
  if (adapter.getMode() !== 'live') {
    return createResponse({
      success: false,
      data: { error: 'Connection refresh is only available in live mode (MCP_MODE=live)' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The refresh_connection tool requires live mode. Mock mode does not use OAuth tokens.',
    });
  }

  // Get the live adapter
  const liveAdapter = adapter as any;
  if (typeof liveAdapter.refreshConnection !== 'function') {
    return createResponse({
      success: false,
      data: { error: 'Adapter does not support connection refresh' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The current adapter configuration does not support connection refresh.',
    });
  }

  try {
    const result = await liveAdapter.refreshConnection(tenant_id);

    if (!result.success) {
      return createResponse({
        success: false,
        data: { error: result.error || 'Failed to refresh connection' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: `Failed to refresh tokens for tenant '${tenant_id}': ${result.error}`,
        recovery: {
          suggested_action_id: 're_authorize',
          description: 'Token refresh failed. Re-authorize with Xero by starting the OAuth flow again.',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
    }

    return createResponse({
      success: true,
      data: {
        tenant_id,
        refreshed: true,
        message: 'Tokens refreshed successfully. You can continue using Xero API tools.',
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Successfully refreshed tokens for tenant '${tenant_id}'. The connection is now active.`,
    });
  } catch (error) {
    return createResponse({
      success: false,
      data: { error: error instanceof Error ? error.message : 'Unknown error refreshing connection' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Failed to refresh tokens for tenant '${tenant_id}'.`,
      recovery: {
        suggested_action_id: 're_authorize',
        description: 'Token refresh failed. Re-authorize with Xero by starting the OAuth flow again.',
        next_tool_call: {
          name: 'get_authorization_url',
          arguments: {},
        },
      },
    });
  }
}
