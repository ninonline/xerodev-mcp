import { describe, it, expect, beforeEach } from 'vitest';
import { handleListConnections, type ListConnectionsArgs } from '../../../../src/tools/oauth/list-connections.js';
import { XeroMockAdapter } from '../../../../src/adapters/xero-mock-adapter.js';

describe('list_connections', () => {
  let adapter: XeroMockAdapter;

  beforeEach(() => {
    adapter = new XeroMockAdapter();
  });

  const validArgs: ListConnectionsArgs = {
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should fail in mock mode', async () => {
      const result = await handleListConnections(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('only available in live mode');
    });

    it('should provide recovery action for mock mode', async () => {
      const result = await handleListConnections(validArgs, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.suggested_action_id).toBe('use_mock_capabilities');
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });
  });

  // ============================================
  // Live Mode Tests
  // ============================================
  describe('live mode', () => {
    it('should return error when adapter does not support connection listing', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
      } as any;

      const result = await handleListConnections(validArgs, mockLiveAdapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('does not support connection listing');
    });

    it('should handle include_inactive parameter', async () => {
      const mockLiveAdapter = {
        getMode: () => 'live' as const,
        getConnections: () => [],
      } as any;

      const result = await handleListConnections({
        ...validArgs,
        include_inactive: true,
      }, mockLiveAdapter);

      expect(result.success).toBe(true);
      expect((result.data as any).connections).toBeDefined();
      expect(Array.isArray((result.data as any).connections)).toBe(true);
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleListConnections({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
