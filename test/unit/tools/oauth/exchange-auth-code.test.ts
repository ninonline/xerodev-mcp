import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleExchangeAuthCode, type ExchangeAuthCodeArgs } from '../../../../src/tools/oauth/exchange-auth-code.js';
import { XeroMockAdapter } from '../../../../src/adapters/xero-mock-adapter.js';
import { clearAllStates } from '../../../../src/core/oauth-state.js';

describe('exchange_auth_code', () => {
  let adapter: XeroMockAdapter;

  beforeEach(() => {
    adapter = new XeroMockAdapter();
    clearAllStates();
  });

  afterEach(() => {
    clearAllStates();
  });

  const validArgs: ExchangeAuthCodeArgs = {
    callback_url: 'http://localhost:3000/callback?code=test-code&state=test-state',
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should fail in mock mode', async () => {
      const result = await handleExchangeAuthCode(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('only available in live mode');
    });

    it('should provide recovery action for mock mode', async () => {
      const result = await handleExchangeAuthCode(validArgs, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.suggested_action_id).toBe('use_mock_mode');
    });
  });

  // ============================================
  // Callback URL Validation Tests
  // ============================================
  describe('callback URL validation', () => {
    it('should fail for invalid URL format', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        getConnections: () => [],
        getXeroClient: () => ({}),
      } as any;

      const result = await handleExchangeAuthCode({
        ...validArgs,
        callback_url: 'not-a-valid-url',
      }, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('Invalid callback URL format');
      expect(result.recovery?.next_tool_call?.name).toBe('get_authorization_url');
    });

    it('should fail when callback URL has no code parameter', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        getConnections: () => [],
        getXeroClient: () => ({}),
      } as any;

      const result = await handleExchangeAuthCode({
        callback_url: 'http://localhost:3000/callback?state=test-state',
        verbosity: 'diagnostic',
      }, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('No authorization code found');
    });

    it('should fail when callback URL has no state parameter', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        getConnections: () => [],
        getXeroClient: () => ({}),
      } as any;

      const result = await handleExchangeAuthCode({
        callback_url: 'http://localhost:3000/callback?code=test-code',
        verbosity: 'diagnostic',
      }, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('No state parameter found');
    });

    it('should handle Xero error in callback URL', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        getConnections: () => [],
        getXeroClient: () => ({}),
      } as any;

      const result = await handleExchangeAuthCode({
        callback_url: 'http://localhost:3000/callback?error=access_denied&error_description=User%20denied%20access',
        verbosity: 'diagnostic',
      }, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('User denied access');
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleExchangeAuthCode({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
