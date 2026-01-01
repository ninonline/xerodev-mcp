import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import type { XeroAdapter } from '../../adapters/adapter-factory.js';

export const RevokeConnectionSchema = z.object({
  tenant_id: z.string().describe('The tenant ID to revoke'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type RevokeConnectionArgs = z.infer<typeof RevokeConnectionSchema>;

export const REVOKE_CONNECTION_TOOL = {
  name: 'revoke_connection',
  description: `Removes a stored Xero tenant connection from the database.

**WHEN TO USE:**
- You want to disconnect a Xero organisation
- You need to re-authorize a connection (revoke then re-authorize)
- Cleaning up old/unused connections

**WARNING:**
This operation cannot be undone. After revoking, you must complete the OAuth flow again to reconnect.

**Note:** This does NOT revoke the tokens at Xero. Tokens remain valid until they expire. To fully revoke, visit your Xero app settings.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'The tenant ID to revoke',
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

interface RevokeConnectionResult {
  tenant_id: string;
  revoked: boolean;
}

export async function handleRevokeConnection(
  args: RevokeConnectionArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<RevokeConnectionResult | { error: string }>> {
  const startTime = Date.now();
  const { tenant_id, verbosity } = args;

  // This tool only works in live mode
  if (adapter.getMode() !== 'live') {
    const response = createResponse({
      success: false,
      data: { error: 'Connection revocation is only available in live mode (MCP_MODE=live)' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The revoke_connection tool requires live mode. Mock mode does not have stored connections.',
    });
    auditLogResponse(response, 'revoke_connection', null, Date.now() - startTime);
    return response;
  }

  // Get the live adapter
  const liveAdapter = adapter as any;
  if (typeof liveAdapter.revokeConnection !== 'function') {
    const response = createResponse({
      success: false,
      data: { error: 'Adapter does not support connection revocation' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The current adapter configuration does not support connection revocation.',
    });
    auditLogResponse(response, 'revoke_connection', null, Date.now() - startTime);
    return response;
  }

  try {
    const result = liveAdapter.revokeConnection(tenant_id);

    if (!result.success) {
      const response = createResponse({
        success: false,
        data: { error: result.error || 'Failed to revoke connection' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: `Failed to revoke connection for tenant '${tenant_id}': ${result.error}`,
      });
      auditLogResponse(response, 'revoke_connection', null, Date.now() - startTime);
      return response;
    }

    const response = createResponse({
      success: true,
      data: {
        tenant_id,
        revoked: true,
        message: `Connection for tenant '${tenant_id}' has been removed.`,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Successfully revoked connection for tenant '${tenant_id}'. ` +
        `To reconnect, complete the OAuth flow again by calling \`get_authorization_url\`.`,
      recovery: {
        suggested_action_id: 're_authorize',
        description: 'Re-authorize with Xero to reconnect this organisation',
        next_tool_call: {
          name: 'get_authorization_url',
          arguments: {},
        },
      },
    });
    auditLogResponse(response, 'revoke_connection', null, Date.now() - startTime);
    return response;
  } catch (error) {
    const response = createResponse({
      success: false,
      data: { error: error instanceof Error ? error.message : 'Unknown error revoking connection' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Failed to revoke connection for tenant '${tenant_id}'.`,
    });
    auditLogResponse(response, 'revoke_connection', null, Date.now() - startTime);
    return response;
  }
}
