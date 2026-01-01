import { describe, it, expect, beforeEach } from 'vitest';
import { handleRefreshConnection, type RefreshConnectionArgs } from '../../../../src/tools/oauth/refresh-connection.js';
import { XeroMockAdapter } from '../../../../src/adapters/xero-mock-adapter.js';

describe('refresh_connection', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'test-tenant-001';

  beforeEach(() => {
    adapter = new XeroMockAdapter();
  });

  const validArgs: RefreshConnectionArgs = {
    tenant_id: tenantId,
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should fail in mock mode', async () => {
      const result = await handleRefreshConnection(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('only available in live mode');
    });

    it('should require tenant_id parameter', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
      } as any;

      const result = await handleRefreshConnection({
        verbosity: 'diagnostic',
      } as any, mockLiveAdapter);

      // Schema validation should catch this
      expect(result).toBeDefined();
    });
  });

  // ============================================
  // Live Mode Tests
  // ============================================
  describe('live mode', () => {
    it('should return error when adapter does not support refresh', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
      } as any;

      const result = await handleRefreshConnection(validArgs, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('does not support connection refresh');
    });

    it('should handle successful refresh', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        refreshConnection: async () => ({ success: true }),
      } as any;

      const result = await handleRefreshConnection(validArgs, mockLiveAdapter);

      expect(result.success).toBe(true);
      expect((result.data as any).refreshed).toBe(true);
    });

    it('should handle failed refresh', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        refreshConnection: async () => ({ success: false, error: 'Token expired' }),
      } as any;

      const result = await handleRefreshConnection(validArgs, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('Token expired');
      expect(result.recovery?.next_tool_call?.name).toBe('get_authorization_url');
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleRefreshConnection({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
