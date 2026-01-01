import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  handleCreateInvoice,
  clearInvoiceIdempotencyStore,
  getInvoiceFromIdempotencyStore,
} from '../../../src/tools/crud/create-invoice.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('create_invoice', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';
  const validContactId = 'contact-001';
  const validAccountCode = '200';

  const validLineItems = [
    {
      description: 'Consulting Services',
      quantity: 10,
      unit_amount: 150.00,
      account_code: validAccountCode,
      tax_type: 'OUTPUT',
    },
  ];

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearInvoiceIdempotencyStore();
    clearSimulation(tenantId);
  });

  describe('basic functionality', () => {
    it('should create a sales invoice (ACCREC)', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.invoice.type).toBe('ACCREC');
      expect(result.data.invoice.invoice_id).toMatch(/^inv-/); // Mock adapter uses inv- format
      expect(result.data.invoice.invoice_number).toMatch(/^INV-/);
      expect(result.data.invoice.status).toBe('DRAFT');
      expect(result.data.validation_passed).toBe(true);
    });

    it('should create a bill (ACCPAY)', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCPAY',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.invoice.type).toBe('ACCPAY');
      expect(result.data.invoice.invoice_number).toMatch(/^BILL-/);
    });

    it('should calculate totals correctly', async () => {
      const lineItems = [
        { description: 'Item 1', quantity: 2, unit_amount: 100, account_code: validAccountCode },
        { description: 'Item 2', quantity: 3, unit_amount: 50, account_code: validAccountCode },
      ];

      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: lineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.invoice.sub_total).toBe(350); // (2*100) + (3*50)
      expect(result.data.invoice.total_tax).toBe(35); // 10% GST
      expect(result.data.invoice.total).toBe(385);
    });

    it('should use AUD currency for AU tenant', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.currency_code).toBe('AUD');
    });

    it('should set default dates if not provided', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.data.invoice.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should use provided dates', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          date: '2025-01-15',
          due_date: '2025-02-15',
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.date).toBe('2025-01-15');
      expect(result.data.invoice.due_date).toBe('2025-02-15');
    });

    it('should include reference if provided', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          reference: 'PO-12345',
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.reference).toBe('PO-12345');
    });
  });

  describe('validation', () => {
    it('should fail for non-existent contact', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: 'non-existent-contact',
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.validation_passed).toBe(false);
      expect(result.diagnostics?.narrative).toContain('not found');
      expect(result.recovery?.next_tool_call?.name).toBe('introspect_enums');
    });

    it('should fail for non-existent account code', async () => {
      const invalidLineItems = [
        {
          description: 'Test',
          quantity: 1,
          unit_amount: 100,
          account_code: 'INVALID-CODE',
        },
      ];

      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: invalidLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.validation_passed).toBe(false);
      expect(result.diagnostics?.narrative).toContain('Account code');
      expect(result.recovery?.next_tool_call?.name).toBe('introspect_enums');
    });

    it('should fail for archived account code', async () => {
      // Account code 999 is archived in fixtures
      const archivedLineItems = [
        {
          description: 'Test',
          quantity: 1,
          unit_amount: 100,
          account_code: '999',
        },
      ];

      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: archivedLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.diagnostics?.narrative).toContain('ARCHIVED');
    });

    it('should fail for non-existent tenant', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: 'non-existent-tenant',
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });
  });

  describe('idempotency', () => {
    it('should return existing invoice when using same idempotency key', async () => {
      const key = 'invoice-idem-key-123';

      const result1 = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          idempotency_key: key,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      const result2 = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          idempotency_key: key,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result1.data.invoice.invoice_id).toBe(result2.data.invoice.invoice_id);
      expect(result2.data.was_duplicate).toBe(true);
    });

    it('should create new invoice with different idempotency key', async () => {
      const result1 = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          idempotency_key: 'key-1',
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      const result2 = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          idempotency_key: 'key-2',
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result1.data.invoice.invoice_id).not.toBe(result2.data.invoice.invoice_id);
      expect(result2.data.was_duplicate).toBe(false);
    });

    it('should store invoice in idempotency store', async () => {
      const key = 'store-test-invoice-key';

      await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          idempotency_key: key,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      const stored = getInvoiceFromIdempotencyStore(key);
      expect(stored).toBeDefined();
      expect(stored?.type).toBe('ACCREC');
    });
  });

  describe('chaos simulation integration', () => {
    it('should fail when network simulation is active', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'TOKEN_EXPIRED',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.diagnostics?.narrative).toContain('TOKEN_EXPIRED');
      expect(result.recovery?.next_tool_call?.name).toBe('simulate_network_conditions');
    });
  });

  describe('invoice statuses', () => {
    it('should create DRAFT invoice', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.status).toBe('DRAFT');
    });

    it('should create SUBMITTED invoice', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'SUBMITTED',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.status).toBe('SUBMITTED');
    });

    it('should create AUTHORISED invoice', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'AUTHORISED',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.status).toBe('AUTHORISED');
    });
  });

  describe('line items', () => {
    it('should include line amounts', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.line_items[0].line_amount).toBe(1500); // 10 * 150
    });

    it('should handle multiple line items', async () => {
      const multiLineItems = [
        { description: 'Item 1', quantity: 1, unit_amount: 100, account_code: validAccountCode },
        { description: 'Item 2', quantity: 2, unit_amount: 50, account_code: validAccountCode },
        { description: 'Item 3', quantity: 5, unit_amount: 20, account_code: validAccountCode },
      ];

      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: multiLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.invoice.line_items.length).toBe(3);
      expect(result.data.invoice.sub_total).toBe(300); // 100 + 100 + 100
    });
  });

  describe('verbosity levels', () => {
    it('should include narrative in diagnostic mode', async () => {
      const result = await handleCreateInvoice(
        {
          tenant_id: tenantId,
          type: 'ACCREC',
          contact_id: validContactId,
          line_items: validLineItems,
          status: 'DRAFT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.diagnostics?.narrative).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('Created');
      expect(result.diagnostics?.narrative).toContain('AUD');
    });
  });
});
