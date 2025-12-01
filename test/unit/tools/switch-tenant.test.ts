import { describe, it, expect, beforeAll } from 'vitest';
import { handleSwitchTenant, getCurrentTenantId } from '../../../src/tools/core/switch-tenant.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('switch_tenant_context', () => {
  let adapter: XeroMockAdapter;

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  it('should switch to a valid tenant', async () => {
    const result = await handleSwitchTenant(
      { tenant_id: 'acme-au-001', verbosity: 'diagnostic' },
      adapter
    );

    expect(result.success).toBe(true);
    expect(result.data.tenant_id).toBe('acme-au-001');
    expect(result.data.region).toBe('AU');
    expect(result.data.currency).toBe('AUD');
    expect(result.data.accounts_count).toBeGreaterThan(0);
  });

  it('should update global tenant state', async () => {
    await handleSwitchTenant(
      { tenant_id: 'acme-au-001', verbosity: 'compact' },
      adapter
    );

    expect(getCurrentTenantId()).toBe('acme-au-001');
  });

  it('should return available account types', async () => {
    const result = await handleSwitchTenant(
      { tenant_id: 'acme-au-001', verbosity: 'diagnostic' },
      adapter
    );

    expect(result.data.account_types).toBeDefined();
    expect(result.data.account_types).toContain('REVENUE');
  });

  it('should return available tax types', async () => {
    const result = await handleSwitchTenant(
      { tenant_id: 'acme-au-001', verbosity: 'diagnostic' },
      adapter
    );

    expect(result.data.tax_types).toBeDefined();
    expect(result.data.tax_types.length).toBeGreaterThan(0);
  });

  it('should fail for non-existent tenant', async () => {
    const result = await handleSwitchTenant(
      { tenant_id: 'non-existent-tenant', verbosity: 'diagnostic' },
      adapter
    );

    expect(result.success).toBe(false);
    expect(result.recovery).toBeDefined();
    expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
  });

  it('should include narrative in diagnostic mode', async () => {
    const result = await handleSwitchTenant(
      { tenant_id: 'acme-au-001', verbosity: 'diagnostic' },
      adapter
    );

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.narrative).toContain('Switched to tenant');
  });
});
