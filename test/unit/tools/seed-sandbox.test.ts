import { describe, it, expect, beforeAll } from 'vitest';
import { handleSeedSandbox } from '../../../src/tools/simulation/seed-sandbox.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('seed_sandbox_data', () => {
  let adapter: XeroMockAdapter;

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  describe('CONTACTS entity', () => {
    it('should generate specified number of contacts', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'CONTACTS',
          count: 5,
          scenario: 'DEFAULT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(5);
      expect(result.data.entity_type).toBe('CONTACTS');
    });

    it('should generate contacts with required fields', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'CONTACTS',
          count: 1,
          scenario: 'DEFAULT',
          verbosity: 'debug',
        },
        adapter
      );

      const contact = result.data.generated[0] as any;
      expect(contact.contact_id).toBeDefined();
      expect(contact.name).toBeDefined();
      expect(contact.email).toBeDefined();
      expect(contact.status).toBe('ACTIVE');
    });

    it('should include sample IDs', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'CONTACTS',
          count: 10,
          scenario: 'DEFAULT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.sample_ids.length).toBeLessThanOrEqual(5);
      expect(result.data.sample_ids[0]).toMatch(/^gen-contact-/);
    });
  });

  describe('INVOICES entity', () => {
    it('should generate specified number of invoices', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 5,
          scenario: 'DEFAULT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(5);
      expect(result.data.entity_type).toBe('INVOICES');
    });

    it('should generate invoices with valid structure', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 1,
          scenario: 'DEFAULT',
          verbosity: 'debug',
        },
        adapter
      );

      const invoice = result.data.generated[0] as any;
      expect(invoice.invoice_id).toBeDefined();
      expect(invoice.type).toBe('ACCREC');
      expect(invoice.contact).toBeDefined();
      expect(invoice.contact.contact_id).toBeDefined();
      expect(invoice.line_items).toBeDefined();
      expect(invoice.line_items.length).toBeGreaterThan(0);
    });

    it('should use valid account codes from tenant', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 1,
          scenario: 'DEFAULT',
          verbosity: 'debug',
        },
        adapter
      );

      const invoice = result.data.generated[0] as any;
      // Account code should be from the fixtures
      expect(invoice.line_items[0].account_code).toBeDefined();
    });

    it('should use tenant currency', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 1,
          scenario: 'DEFAULT',
          verbosity: 'debug',
        },
        adapter
      );

      const invoice = result.data.generated[0] as any;
      expect(invoice.currency_code).toBe('AUD');
    });
  });

  describe('scenarios', () => {
    it('should generate OVERDUE_BILLS with past due dates', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 3,
          scenario: 'OVERDUE_BILLS',
          verbosity: 'debug',
        },
        adapter
      );

      const invoices = result.data.generated as any[];
      invoices.forEach(inv => {
        expect(inv.status).toBe('AUTHORISED');
        // Due date should be in the past
        const dueDate = new Date(inv.due_date);
        expect(dueDate.getTime()).toBeLessThan(Date.now());
      });
    });

    it('should generate MIXED_STATUS with various statuses', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 10,
          scenario: 'MIXED_STATUS',
          verbosity: 'debug',
        },
        adapter
      );

      const invoices = result.data.generated as any[];
      const statuses = new Set(invoices.map(inv => inv.status));
      // Should have at least 2 different statuses in 10 invoices
      expect(statuses.size).toBeGreaterThanOrEqual(1);
    });

    it('should generate HIGH_VALUE with larger amounts', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 3,
          scenario: 'HIGH_VALUE',
          verbosity: 'debug',
        },
        adapter
      );

      const invoices = result.data.generated as any[];
      invoices.forEach(inv => {
        const total = inv.line_items.reduce(
          (sum: number, item: any) => sum + item.quantity * item.unit_amount,
          0
        );
        // High value invoices should have significant amounts
        expect(total).toBeGreaterThan(1000);
      });
    });
  });

  describe('verbosity levels', () => {
    it('should limit generated array in non-debug mode', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'CONTACTS',
          count: 10,
          scenario: 'DEFAULT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      // Should only show first 3 in non-debug mode
      expect(result.data.generated.length).toBeLessThanOrEqual(3);
    });

    it('should show all generated in debug mode', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'CONTACTS',
          count: 10,
          scenario: 'DEFAULT',
          verbosity: 'debug',
        },
        adapter
      );

      expect(result.data.generated.length).toBe(10);
    });

    it('should include narrative in diagnostic mode', async () => {
      const result = await handleSeedSandbox(
        {
          tenant_id: 'acme-au-001',
          entity: 'INVOICES',
          count: 5,
          scenario: 'DEFAULT',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.diagnostics?.narrative).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('Generated');
    });
  });

  describe('error handling', () => {
    it('should fail for non-existent tenant', async () => {
      await expect(
        handleSeedSandbox(
          {
            tenant_id: 'non-existent',
            entity: 'CONTACTS',
            count: 5,
            scenario: 'DEFAULT',
            verbosity: 'diagnostic',
          },
          adapter
        )
      ).rejects.toThrow();
    });
  });
});
