import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import type { XeroAdapter } from '../../adapters/adapter-factory.js';
import { validateState } from '../../core/oauth-state.js';

export const ExchangeAuthCodeSchema = z.object({
  callback_url: z.string().describe('The full callback URL from the browser after authorization'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type ExchangeAuthCodeArgs = z.infer<typeof ExchangeAuthCodeSchema>;

export const EXCHANGE_AUTH_CODE_TOOL = {
  name: 'exchange_auth_code',
  description: `Exchanges the OAuth authorization code (from callback URL) for access tokens and stores them securely.

**STEP 2 OF OAUTH FLOW:**
After calling \`get_authorization_url\` and completing authorization in the browser, call this with the callback URL.

**HOW TO GET THE CALLBACK URL:**
1. Visit the authorization URL from \`get_authorization_url\`
2. Log in to Xero and select organisations to authorize
3. After authorization, Xero redirects to your redirect URI
4. The URL in your browser bar is the callback URL - copy the entire URL
5. Pass that URL to this tool as \`callback_url\`

**EXAMPLE CALLBACK URL:**
http://localhost:3000/callback?code=xxxxx&state=yyyyy

**WHAT THIS TOOL DOES:**
1. Extracts the authorization code and state from the URL
2. Validates the state parameter (CSRF protection)
3. Exchanges the code for access/refresh tokens
4. Stores tokens encrypted in the database
5. Fetches and stores tenant information

**AFTER THIS STEP:**
The connection is stored and ready to use. Call \`list_connections\` to see all stored connections.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      callback_url: {
        type: 'string',
        description: 'The full callback URL from the browser after authorization (e.g., http://localhost:3000/callback?code=xxx&state=yyy)',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['callback_url'] as string[],
  },
};

interface ExchangeAuthCodeResult {
  tenant_id: string;
  tenant_name: string;
  xero_region: string;
  granted_scopes: string[];
}

interface ExchangeAuthCodeData {
  connections_established: number;
  tenants: ExchangeAuthCodeResult[];
}

export async function handleExchangeAuthCode(
  args: ExchangeAuthCodeArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<ExchangeAuthCodeData | { error: string }>> {
  const startTime = Date.now();
  const { callback_url, verbosity } = args;

  // This tool only works in live mode
  if (adapter.getMode() !== 'live') {
    const response = createResponse({
      success: false,
      data: { error: 'OAuth flow is only available in live mode (MCP_MODE=live)' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The exchange_auth_code tool requires live mode. In mock mode, all data is simulated and no OAuth is needed.',
      recovery: {
        suggested_action_id: 'use_mock_mode',
        description: 'Continue using mock mode for testing without OAuth',
      },
    });
    auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
    return response;
  }

  // Get the live adapter
  const liveAdapter = adapter as any;
  if (typeof liveAdapter.getXeroClient !== 'function') {
    const response = createResponse({
      success: false,
      data: { error: 'Adapter does not support OAuth' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The current adapter configuration does not support OAuth operations.',
    });
    auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
    return response;
  }

  const xero = liveAdapter.getXeroClient();

  try {
    // Parse the callback URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(callback_url);
    } catch {
      const response = createResponse({
        success: false,
        data: { error: 'Invalid callback URL format' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'The callback_url must be a valid URL. Make sure you copied the entire URL from your browser after authorization.',
        recovery: {
          suggested_action_id: 'restart_oauth',
          description: 'Start the OAuth flow again by calling get_authorization_url',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
      auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
      return response;
    }

    // Extract code and state from URL
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');
    const errorDescription = parsedUrl.searchParams.get('error_description');

    // Check if Xero returned an error
    if (error) {
      const response = createResponse({
        success: false,
        data: { error: errorDescription || error },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: `Xero returned an error: ${error}${errorDescription ? ` - ${errorDescription}` : ''}`,
        recovery: {
          suggested_action_id: 'restart_oauth',
          description: 'Start the OAuth flow again by calling get_authorization_url',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
      auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
      return response;
    }

    if (!code) {
      const response = createResponse({
        success: false,
        data: { error: 'No authorization code found in callback URL' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'The callback URL must contain a "code" parameter. Make sure you copied the entire URL from your browser.',
        recovery: {
          suggested_action_id: 'restart_oauth',
          description: 'Start the OAuth flow again by calling get_authorization_url',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
      auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
      return response;
    }

    if (!state) {
      const response = createResponse({
        success: false,
        data: { error: 'No state parameter found in callback URL' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'The callback URL must contain a "state" parameter for security validation. This may indicate an expired authorization attempt.',
        recovery: {
          suggested_action_id: 'restart_oauth',
          description: 'Start the OAuth flow again by calling get_authorization_url',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
      auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
      return response;
    }

    // Validate state (get code verifier)
    const stateData = validateState(state);
    if (!stateData) {
      const response = createResponse({
        success: false,
        data: { error: 'Invalid or expired state parameter' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'The state parameter is invalid or has expired (10 minute limit). This is a security measure to prevent CSRF attacks. Please start the OAuth flow again.',
        recovery: {
          suggested_action_id: 'restart_oauth',
          description: 'Start the OAuth flow again by calling get_authorization_url',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
      auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
      return response;
    }

    // Exchange the code for tokens
    const tokenSet = await xero.apiCallback(callback_url, stateData.codeVerifier);

    if (!tokenSet) {
      const response = createResponse({
        success: false,
        data: { error: 'Failed to exchange authorization code for tokens' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'Xero rejected the authorization code. It may have expired or already been used.',
        recovery: {
          suggested_action_id: 'restart_oauth',
          description: 'Start the OAuth flow again by calling get_authorization_url',
          next_tool_call: {
            name: 'get_authorization_url',
            arguments: {},
          },
        },
      });
      auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
      return response;
    }

    // Update tenants to get the authorised tenant(s)
    await xero.updateTenants();

    const tenants = xero.tenants;
    if (!tenants || tenants.length === 0) {
      const response = createResponse({
        success: false,
        data: { error: 'No tenants found in token set' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'The authorization was successful but no Xero organisations were found. This is unusual - please try again.',
      });
      auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
      return response;
    }

    // Store each tenant's tokens
    const storedTenants: ExchangeAuthCodeResult[] = [];
    for (const tenant of tenants) {
      const tenantId = tenant.tenantId;
      const tenantName = tenant.tenantName || 'Unknown Organisation';
      const tenantType = tenant.tenantType || 'UNKNOWN';

      if (!tenantId) continue;

      liveAdapter.storeTokensFromCallback(
        tenantId,
        tenantName,
        tokenSet.access_token!,
        tokenSet.refresh_token!,
        tokenSet.expires_at!,
        tokenSet.scope || stateData.scopes,
        tenantType
      );

      storedTenants.push({
        tenant_id: tenantId,
        tenant_name: tenantName,
        xero_region: tenantType,
        granted_scopes: tokenSet.scope || stateData.scopes,
      });
    }

    const response = createResponse({
      success: true,
      data: {
        connections_established: storedTenants.length,
        tenants: storedTenants,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Successfully established ${storedTenants.length} connection(s). ` +
        `You can now use Xero API tools. Call \`list_connections\` to see all stored connections.`,
    });
    auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const response = createResponse({
      success: false,
      data: { error: message },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Failed to exchange authorization code: ${message}`,
      recovery: {
        suggested_action_id: 'restart_oauth',
        description: 'Start the OAuth flow again by calling get_authorization_url',
        next_tool_call: {
          name: 'get_authorization_url',
          arguments: {},
        },
      },
    });
    auditLogResponse(response, 'exchange_auth_code', null, Date.now() - startTime);
    return response;
  }
}
