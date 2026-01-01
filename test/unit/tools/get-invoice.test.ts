import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { handleGetInvoice, type GetInvoiceArgs } from '../../../src/tools/crud/get-invoice.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('get_invoice', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';
  const validInvoiceId = 'inv-001';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearSimulation(tenantId);
  });

  const validArgs: GetInvoiceArgs = {
    tenant_id: tenantId,
    invoice_id: validInvoiceId,
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should fetch an existing invoice', async () => {
      const result = await handleGetInvoice(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).found).toBe(true);
      expect((result.data as any).invoice).toBeDefined();
      expect((result.data as any).invoice.invoice_id).toBe(validInvoiceId);
    });

    it('should return invoice with all expected fields', async () => {
      const result = await handleGetInvoice(validArgs, adapter);

      expect(result.success).toBe(true);
      const invoice = (result.data as any).invoice;
      expect(invoice.type).toBeDefined();
      expect(invoice.contact).toBeDefined();
      expect(invoice.date).toBeDefined();
      expect(invoice.due_date).toBeDefined();
      expect(invoice.status).toBeDefined();
      expect(invoice.line_items).toBeDefined();
      expect(invoice.currency_code).toBeDefined();
      expect(invoice.total).toBeDefined();
    });

    it('should return success true with meta information', async () => {
      const result = await handleGetInvoice(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.meta?.timestamp).toBeDefined();
      expect(result.meta?.request_id).toBeDefined();
      expect(result.meta?.execution_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include narrative in diagnostic verbosity', async () => {
      const result = await handleGetInvoice(validArgs, adapter);

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('invoice');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('error handling', () => {
    it('should fail for non-existent invoice', async () => {
      const result = await handleGetInvoice({
        ...validArgs,
        invoice_id: 'non-existent-invoice',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
    });

    it('should return recovery action for non-existent invoice', async () => {
      const result = await handleGetInvoice({
        ...validArgs,
        invoice_id: 'non-existent-invoice',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('list_invoices');
    });

    it('should fail for non-existent tenant', async () => {
      const result = await handleGetInvoice({
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

      const result = await handleGetInvoice(validArgs, adapter);

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

      const result = await handleGetInvoice(validArgs, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleGetInvoice({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleGetInvoice({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
