import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { handleListInvoices, type ListInvoicesArgs } from '../../../src/tools/crud/list-invoices.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('list_invoices', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearSimulation(tenantId);
  });

  const validArgs: ListInvoicesArgs = {
    tenant_id: tenantId,
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should list invoices without filters', async () => {
      const result = await handleListInvoices(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).invoices).toBeDefined();
      expect(Array.isArray((result.data as any).invoices)).toBe(true);
      expect((result.data as any).total_count).toBeGreaterThan(0);
    });

    it('should return pagination information', async () => {
      const result = await handleListInvoices(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).page).toBe(1);
      expect((result.data as any).page_size).toBe(20);
      expect((result.data as any).total_pages).toBeGreaterThanOrEqual(1);
      expect((result.data as any).total_count).toBeGreaterThan(0);
    });

    it('should return invoices with expected fields', async () => {
      const result = await handleListInvoices(validArgs, adapter);

      expect(result.success).toBe(true);
      const invoices = (result.data as any).invoices;
      if (invoices.length > 0) {
        const invoice = invoices[0];
        expect(invoice.invoice_id).toBeDefined();
        expect(invoice.type).toBeDefined();
        expect(invoice.contact).toBeDefined();
        expect(invoice.status).toBeDefined();
      }
    });

    it('should include meta and diagnostics', async () => {
      const result = await handleListInvoices(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('invoice');
    });
  });

  // ============================================
  // Filter Tests
  // ============================================
  describe('filtering', () => {
    it('should filter by status', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        status: 'AUTHORISED',
      }, adapter);

      expect(result.success).toBe(true);
      const invoices = (result.data as any).invoices;
      invoices.forEach((inv: any) => {
        expect(inv.status).toBe('AUTHORISED');
      });
      expect((result.data as any).filters_applied).toContain('status=AUTHORISED');
    });

    it('should filter by type ACCREC', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        type: 'ACCREC',
      }, adapter);

      expect(result.success).toBe(true);
      const invoices = (result.data as any).invoices;
      invoices.forEach((inv: any) => {
        expect(inv.type).toBe('ACCREC');
      });
      expect((result.data as any).filters_applied).toContain('type=ACCREC');
    });

    it('should filter by contact_id', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        contact_id: 'contact-001',
      }, adapter);

      expect(result.success).toBe(true);
      const invoices = (result.data as any).invoices;
      invoices.forEach((inv: any) => {
        expect(inv.contact.contact_id).toBe('contact-001');
      });
    });

    it('should handle combined filters', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        status: 'AUTHORISED',
        type: 'ACCREC',
      }, adapter);

      expect(result.success).toBe(true);
      const invoices = (result.data as any).invoices;
      invoices.forEach((inv: any) => {
        expect(inv.status).toBe('AUTHORISED');
        expect(inv.type).toBe('ACCREC');
      });
    });

    it('should return empty array for filters with no matches', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        contact_id: 'non-existent-contact',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).invoices).toHaveLength(0);
      expect((result.data as any).total_count).toBe(0);
    });
  });

  // ============================================
  // Pagination Tests
  // ============================================
  describe('pagination', () => {
    it('should respect page_size parameter', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        page_size: 5,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).invoices.length).toBeLessThanOrEqual(5);
      expect((result.data as any).page_size).toBe(5);
    });

    it('should return correct page', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        page: 2,
        page_size: 5,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).page).toBe(2);
    });

    it('should return empty array for page beyond results', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        page: 1000,
        page_size: 20,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).invoices).toHaveLength(0);
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('error handling', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        tenant_id: 'non-existent-tenant',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });
  });

  // ============================================
  // Chaos Simulation Tests
  // ============================================
  describe('chaos simulation', () => {
    it('should fail when rate limit simulation is active', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleListInvoices(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('RATE_LIMIT');
    });

    it('should succeed after simulation is cleared', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      clearSimulation(tenantId);

      const result = await handleListInvoices(validArgs, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleListInvoices({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
