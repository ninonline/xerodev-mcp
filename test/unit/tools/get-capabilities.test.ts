import { describe, it, expect, beforeAll } from 'vitest';
import { handleGetCapabilities } from '../../../src/tools/core/get-capabilities.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('get_mcp_capabilities', () => {
  let adapter: XeroMockAdapter;

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  it('should return server capabilities with tenants', async () => {
    const result = await handleGetCapabilities(
      { include_tenants: true, verbosity: 'diagnostic' },
      adapter
    );

    expect(result.success).toBe(true);
    expect(result.data.server.name).toBe('xerodev-mcp');
    expect(result.data.server.mode).toBe('mock');
    expect(result.data.available_tenants).toBeDefined();
    expect(result.data.available_tenants.length).toBeGreaterThan(0);
  });

  it('should return capabilities without tenants when include_tenants is false', async () => {
    const result = await handleGetCapabilities(
      { include_tenants: false, verbosity: 'compact' },
      adapter
    );

    expect(result.success).toBe(true);
    expect(result.data.available_tenants).toBeUndefined();
  });

  it('should include guidelines for AI agents', async () => {
    const result = await handleGetCapabilities(
      { include_tenants: true, verbosity: 'diagnostic' },
      adapter
    );

    expect(result.data.guidelines).toBeDefined();
    expect(result.data.guidelines.workflow).toBeDefined();
    expect(result.data.guidelines.workflow.length).toBeGreaterThan(0);
  });

  it('should include rate limit information', async () => {
    const result = await handleGetCapabilities(
      { include_tenants: true, verbosity: 'diagnostic' },
      adapter
    );

    expect(result.data.rate_limits).toBeDefined();
    expect(result.data.rate_limits.mode).toBe('unlimited');
  });

  it('should include metadata in diagnostic verbosity', async () => {
    const result = await handleGetCapabilities(
      { include_tenants: true, verbosity: 'diagnostic' },
      adapter
    );

    expect(result.meta).toBeDefined();
    expect(result.meta?.timestamp).toBeDefined();
    expect(result.meta?.request_id).toBeDefined();
  });

  it('should exclude metadata in silent verbosity', async () => {
    const result = await handleGetCapabilities(
      { include_tenants: true, verbosity: 'silent' },
      adapter
    );

    expect(result.meta).toBeUndefined();
  });
});
