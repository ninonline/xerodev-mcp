import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGetAuthorizationUrl, type GetAuthorizationUrlArgs } from '../../../../src/tools/oauth/get-authorization-url.js';
import { XeroMockAdapter } from '../../../../src/adapters/xero-mock-adapter.js';
import { clearAllStates } from '../../../../src/core/oauth-state.js';

describe('get_authorization_url', () => {
  let adapter: XeroMockAdapter;

  beforeEach(() => {
    adapter = new XeroMockAdapter();
    clearAllStates();
  });

  afterEach(() => {
    clearAllStates();
  });

  const validArgs: GetAuthorizationUrlArgs = {
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should fail in mock mode', async () => {
      const result = await handleGetAuthorizationUrl(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('only available in live mode');
    });

    it('should provide recovery action for mock mode', async () => {
      const result = await handleGetAuthorizationUrl(validArgs, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.suggested_action_id).toBe('use_mock_mode');
    });
  });

  // ============================================
  // Live Mode Tests
  // ============================================
  describe('live mode', () => {
    it('should return error when XERO_CLIENT_ID is not set', async () => {
      // Save original value
      const originalClientId = process.env.XERO_CLIENT_ID;
      delete process.env.XERO_CLIENT_ID;

      // Create a mock live adapter without getXeroClient method
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        getConnections: () => [],
      } as any;

      const result = await handleGetAuthorizationUrl(validArgs, mockLiveAdapter);

      expect(result.success).toBe(false);

      // Restore
      if (originalClientId) {
        process.env.XERO_CLIENT_ID = originalClientId;
      }
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleGetAuthorizationUrl({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleGetAuthorizationUrl({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
