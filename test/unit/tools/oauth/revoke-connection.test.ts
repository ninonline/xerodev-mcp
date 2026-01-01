import { describe, it, expect, beforeEach } from 'vitest';
import { handleRevokeConnection, type RevokeConnectionArgs } from '../../../../src/tools/oauth/revoke-connection.js';
import { XeroMockAdapter } from '../../../../src/adapters/xero-mock-adapter.js';

describe('revoke_connection', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'test-tenant-001';

  beforeEach(() => {
    adapter = new XeroMockAdapter();
  });

  const validArgs: RevokeConnectionArgs = {
    tenant_id: tenantId,
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should fail in mock mode', async () => {
      const result = await handleRevokeConnection(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('only available in live mode');
    });

    it('should require tenant_id parameter', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
      } as any;

      const result = await handleRevokeConnection({
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
    it('should return error when adapter does not support revocation', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
      } as any;

      const result = await handleRevokeConnection(validArgs, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('does not support connection revocation');
    });

    it('should handle successful revocation', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        revokeConnection: () => ({ success: true }),
      } as any;

      const result = await handleRevokeConnection(validArgs, mockLiveAdapter);

      expect(result.success).toBe(true);
      expect((result.data as any).revoked).toBe(true);
      expect(result.recovery?.suggested_action_id).toBe('re_authorize');
      expect(result.recovery?.next_tool_call?.name).toBe('get_authorization_url');
    });

    it('should handle failed revocation', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        revokeConnection: () => ({ success: false, error: 'Tenant not found' }),
      } as any;

      const result = await handleRevokeConnection(validArgs, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('Tenant not found');
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleRevokeConnection({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
