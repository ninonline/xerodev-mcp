import { describe, it, expect, beforeAll } from 'vitest';
import { handleDryRunSync } from '../../../src/tools/simulation/dry-run-sync.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('dry_run_sync', () => {
  let adapter: XeroMockAdapter;

  const validInvoice = {
    type: 'ACCREC',
    contact: { contact_id: 'contact-001' },
    date: '2025-01-15',
    due_date: '2025-02-15',
    line_items: [{
      description: 'Consulting Services',
      quantity: 10,
      unit_amount: 150.00,
      account_code: '200',
      tax_type: 'OUTPUT',
    }],
  };

  const invalidInvoice = {
    type: 'ACCREC',
    contact: { contact_id: 'non-existent' },
    line_items: [{
      description: 'Test',
      quantity: 1,
      unit_amount: 100,
      account_code: 'INVALID',
      tax_type: 'INVALID',
    }],
  };

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  describe('create_invoices operation', () => {
    it('should pass all valid invoices', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [validInvoice, validInvoice],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.would_succeed).toBe(2);
      expect(result.data.would_fail).toBe(0);
      expect(result.data.success_rate).toBe(1);
    });

    it('should fail invalid invoices', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [invalidInvoice],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.would_fail).toBe(1);
    });

    it('should handle mixed valid and invalid payloads', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [validInvoice, invalidInvoice, validInvoice],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.total_payloads).toBe(3);
      expect(result.data.would_succeed).toBe(2);
      expect(result.data.would_fail).toBe(1);
      expect(result.data.success_rate).toBeCloseTo(0.67, 1);
    });

    it('should calculate estimated total amount', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [validInvoice],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.estimated_total_amount).toBe(1500); // 10 * 150
    });

    it('should provide recovery action on failure', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [invalidInvoice],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('introspect_enums');
    });

    it('should include issues summary', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [invalidInvoice, invalidInvoice],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.issues_summary.length).toBeGreaterThan(0);
    });
  });

  describe('create_contacts operation', () => {
    it('should pass valid contacts', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_contacts',
          payloads: [
            { name: 'Test Contact', email: 'test@example.com' },
          ],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.would_succeed).toBe(1);
    });

    it('should fail invalid contacts', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_contacts',
          payloads: [
            { email: 'test@example.com' }, // Missing name
          ],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.would_fail).toBe(1);
    });
  });

  describe('verbosity levels', () => {
    it('should include all results in debug mode', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [validInvoice, validInvoice],
          verbosity: 'debug',
        },
        adapter
      );

      expect(result.data.results.length).toBe(2);
    });

    it('should only include failed results in non-debug mode', async () => {
      const result = await handleDryRunSync(
        {
          tenant_id: 'acme-au-001',
          operation: 'create_invoices',
          payloads: [validInvoice, invalidInvoice],
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.results.length).toBe(1);
      expect(result.data.results[0].valid).toBe(false);
    });
  });
});
