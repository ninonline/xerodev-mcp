import { describe, it, expect, beforeAll } from 'vitest';
import { handleIntrospectEnums } from '../../../src/tools/validation/introspect-enums.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('introspect_enums', () => {
  let adapter: XeroMockAdapter;

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  describe('Account introspection', () => {
    it('should return all accounts', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Account',
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBeGreaterThan(0);
      expect(result.data.values.length).toBeGreaterThan(0);
    });

    it('should filter accounts by type', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Account',
          filter: { type: 'REVENUE' },
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.success).toBe(true);
      const accounts = result.data.values as Array<{ type: string }>;
      accounts.forEach(a => {
        expect(a.type).toBe('REVENUE');
      });
    });

    it('should filter accounts by status', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Account',
          filter: { status: 'ACTIVE' },
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.success).toBe(true);
      // Should not include archived accounts
      expect(result.data.count).toBeGreaterThan(0);
    });

    it('should return account details with code, name, and type', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Account',
          verbosity: 'compact',
        },
        adapter
      );

      const firstAccount = result.data.values[0] as { code: string; name: string; type: string };
      expect(firstAccount.code).toBeDefined();
      expect(firstAccount.name).toBeDefined();
      expect(firstAccount.type).toBeDefined();
    });
  });

  describe('TaxRate introspection', () => {
    it('should return active tax rates', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'TaxRate',
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBeGreaterThan(0);
    });

    it('should include tax_type and rate', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'TaxRate',
          verbosity: 'compact',
        },
        adapter
      );

      const firstRate = result.data.values[0] as { tax_type: string; rate: number };
      expect(firstRate.tax_type).toBeDefined();
      expect(typeof firstRate.rate).toBe('number');
    });

    it('should include tenant region', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'TaxRate',
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.data.tenant_region).toBe('AU');
    });
  });

  describe('Contact introspection', () => {
    it('should return all contacts', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Contact',
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBeGreaterThan(0);
    });

    it('should filter contacts by is_customer', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Contact',
          filter: { is_customer: true },
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.success).toBe(true);
    });

    it('should filter contacts by is_supplier', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Contact',
          filter: { is_supplier: true },
          verbosity: 'compact',
        },
        adapter
      );

      expect(result.success).toBe(true);
    });

    it('should return contact details with id, name, and email', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Contact',
          verbosity: 'compact',
        },
        adapter
      );

      const firstContact = result.data.values[0] as { contact_id: string; name: string };
      expect(firstContact.contact_id).toBeDefined();
      expect(firstContact.name).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'non-existent',
          entity_type: 'Account',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.diagnostics?.narrative).toContain('Failed');
    });
  });

  describe('Verbosity levels', () => {
    it('should include narrative in diagnostic mode', async () => {
      const result = await handleIntrospectEnums(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Account',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.diagnostics?.narrative).toBeDefined();
    });
  });
});
