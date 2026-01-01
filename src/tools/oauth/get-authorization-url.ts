import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import type { XeroAdapter } from '../../adapters/adapter-factory.js';
import { generateState } from '../../core/oauth-state.js';

export const GetAuthorizationUrlSchema = z.object({
  scopes: z.array(z.string()).optional().describe('OAuth scopes to request (defaults to standard accounting scopes)'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type GetAuthorizationUrlArgs = z.infer<typeof GetAuthorizationUrlSchema>;

export const GET_AUTHORIZATION_URL_TOOL = {
  name: 'get_authorization_url',
  description: `Generates a Xero OAuth 2.0 authorization URL for the user to visit in their browser.

**STEP 1 OF OAUTH FLOW:**
Call this tool first to get the authorization URL, then visit it in your browser.

**WHAT HAPPENS NEXT:**
1. User visits the returned URL in a web browser
2. User logs into Xero (if not already logged in)
3. User selects which Xero organisation(s) to authorize
4. Xero redirects to the callback URL with an authorization code
5. User copies the full callback URL
6. User calls \`exchange_auth_code\` with the callback URL

**SCOPES:**
Optional array of OAuth scopes. Defaults to:
- openid, profile, email (identity)
- accounting.transactions (read/write invoices, quotes, etc.)
- accounting.contacts (read/write contacts)
- accounting.settings (read Chart of Accounts, tax rates)

Full scope list: https://developer.xero.com/documentation/oauth2/scopes

**RETURNS:**
- authorization_url: The URL to visit in browser
- state: CSRF state token (for validation during callback exchange)
- code_verifier: PKCE verifier (used internally during callback exchange)`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      scopes: {
        type: 'array',
        items: { type: 'string' },
        description: 'OAuth scopes to request (defaults to standard accounting scopes)',
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

interface GetAuthorizationUrlResult {
  authorization_url: string;
  state: string;
  expires_at: number; // Unix timestamp when state expires
}

export async function handleGetAuthorizationUrl(
  args: GetAuthorizationUrlArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<GetAuthorizationUrlResult | { error: string }>> {
  const startTime = Date.now();
  const { scopes, verbosity } = args;

  // This tool only works in live mode
  if (adapter.getMode() !== 'live') {
    const response = createResponse({
      success: false,
      data: { error: 'OAuth flow is only available in live mode (MCP_MODE=live)' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The get_authorization_url tool requires live mode. In mock mode, all data is simulated and no OAuth is needed.',
      recovery: {
        suggested_action_id: 'use_mock_mode',
        description: 'Continue using mock mode for testing without OAuth',
      },
    });
    auditLogResponse(response, 'get_authorization_url', null, Date.now() - startTime);
    return response;
  }

  // Get the XeroClient from the live adapter
  const liveAdapter = adapter as any;
  if (typeof liveAdapter.getXeroClient !== 'function') {
    const response = createResponse({
      success: false,
      data: { error: 'Adapter does not support OAuth' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'The current adapter configuration does not support OAuth operations.',
    });
    auditLogResponse(response, 'get_authorization_url', null, Date.now() - startTime);
    return response;
  }

  // Default scopes for accounting operations
  const defaultScopes = [
    'openid',
    'profile',
    'email',
    'accounting.transactions',
    'accounting.contacts',
    'accounting.settings',
  ];

  const requestedScopes = scopes && scopes.length > 0 ? scopes : defaultScopes;

  try {
    // Generate state and PKCE verifier
    const { state, codeChallenge } = generateState(requestedScopes);

    // Build the authorization URL manually with PKCE
    const redirectUri = process.env.XERO_REDIRECT_URI || 'http://localhost:3000/callback';
    const clientId = process.env.XERO_CLIENT_ID;

    if (!clientId) {
      const response = createResponse({
        success: false,
        data: { error: 'XERO_CLIENT_ID environment variable is not set' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'The Xero client ID must be configured before using OAuth. Set the XERO_CLIENT_ID environment variable.',
      });
      auditLogResponse(response, 'get_authorization_url', null, Date.now() - startTime);
      return response;
    }

    // Construct the authorization URL
    const authUrl = new URL('https://login.xero.com/identity/connect/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', requestedScopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const result: GetAuthorizationUrlResult = {
      authorization_url: authUrl.toString(),
      state,
      expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes from now
    };

    const response = createResponse({
      success: true,
      data: result,
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Authorization URL generated. State expires in 10 minutes. ` +
        `Visit the URL in your browser, authorize with Xero, then copy the callback URL. ` +
        `Call \`exchange_auth_code\` with the full callback URL to complete the flow.`,
    });
    auditLogResponse(response, 'get_authorization_url', null, Date.now() - startTime);
    return response;
  } catch (error) {
    const response = createResponse({
      success: false,
      data: { error: error instanceof Error ? error.message : 'Unknown error generating authorization URL' },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: 'Failed to generate OAuth authorization URL. Check that Xero credentials are properly configured.',
      recovery: {
        suggested_action_id: 'check_credentials',
        description: 'Verify XERO_CLIENT_ID and XERO_REDIRECT_URI environment variables are set',
      },
    });
    auditLogResponse(response, 'get_authorization_url', null, Date.now() - startTime);
    return response;
  }
}
