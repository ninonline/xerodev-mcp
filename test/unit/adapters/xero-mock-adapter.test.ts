import { describe, it, expect, beforeAll } from 'vitest';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('XeroMockAdapter', () => {
  let adapter: XeroMockAdapter;

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  describe('getMode', () => {
    it('should return mock mode', () => {
      expect(adapter.getMode()).toBe('mock');
    });
  });

  describe('getTenants', () => {
    it('should return loaded tenants', async () => {
      const tenants = await adapter.getTenants();
      expect(tenants.length).toBeGreaterThan(0);
    });

    it('should include tenant details', async () => {
      const tenants = await adapter.getTenants();
      const tenant = tenants[0];
      expect(tenant.tenant_id).toBeDefined();
      expect(tenant.tenant_name).toBeDefined();
      expect(tenant.region).toBeDefined();
    });
  });

  describe('getTenantContext', () => {
    it('should return tenant context for valid tenant', async () => {
      const context = await adapter.getTenantContext('acme-au-001');
      expect(context.tenant_id).toBe('acme-au-001');
      expect(context.region).toBe('AU');
      expect(context.currency).toBe('AUD');
    });

    it('should include accounts, tax rates, and contacts', async () => {
      const context = await adapter.getTenantContext('acme-au-001');
      expect(context.accounts.length).toBeGreaterThan(0);
      expect(context.tax_rates.length).toBeGreaterThan(0);
      expect(context.contacts.length).toBeGreaterThan(0);
    });

    it('should throw for non-existent tenant', async () => {
      await expect(adapter.getTenantContext('non-existent'))
        .rejects.toThrow('not found');
    });
  });

  describe('getAccounts', () => {
    it('should return all accounts for tenant', async () => {
      const accounts = await adapter.getAccounts('acme-au-001');
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should filter accounts by type', async () => {
      const accounts = await adapter.getAccounts('acme-au-001', { type: 'REVENUE' });
      accounts.forEach(a => {
        expect(a.type).toBe('REVENUE');
      });
    });

    it('should filter accounts by status', async () => {
      const accounts = await adapter.getAccounts('acme-au-001', { status: 'ACTIVE' });
      accounts.forEach(a => {
        expect(a.status).toBe('ACTIVE');
      });
    });

    it('should return empty array for unknown tenant', async () => {
      const accounts = await adapter.getAccounts('unknown');
      expect(accounts).toEqual([]);
    });
  });

  describe('getTaxRates', () => {
    it('should return tax rates for tenant', async () => {
      const taxRates = await adapter.getTaxRates('acme-au-001');
      expect(taxRates.length).toBeGreaterThan(0);
    });

    it('should include AU-specific tax types', async () => {
      const taxRates = await adapter.getTaxRates('acme-au-001');
      const taxTypes = taxRates.map(t => t.tax_type);
      expect(taxTypes).toContain('OUTPUT');
      expect(taxTypes).toContain('INPUT');
    });
  });

  describe('getContacts', () => {
    it('should return contacts for tenant', async () => {
      const contacts = await adapter.getContacts('acme-au-001');
      expect(contacts.length).toBeGreaterThan(0);
    });

    it('should filter contacts by is_customer', async () => {
      const contacts = await adapter.getContacts('acme-au-001', { is_customer: true });
      contacts.forEach(c => {
        expect(c.is_customer).toBe(true);
      });
    });

    it('should filter contacts by is_supplier', async () => {
      const contacts = await adapter.getContacts('acme-au-001', { is_supplier: true });
      contacts.forEach(c => {
        expect(c.is_supplier).toBe(true);
      });
    });
  });

  describe('getInvoices', () => {
    it('should return invoices for tenant', async () => {
      const invoices = await adapter.getInvoices('acme-au-001');
      expect(invoices.length).toBeGreaterThan(0);
    });

    it('should filter invoices by status', async () => {
      const invoices = await adapter.getInvoices('acme-au-001', { status: 'DRAFT' });
      invoices.forEach(i => {
        expect(i.status).toBe('DRAFT');
      });
    });

    it('should filter invoices by contact_id', async () => {
      const invoices = await adapter.getInvoices('acme-au-001', { contact_id: 'contact-001' });
      invoices.forEach(i => {
        expect(i.contact.contact_id).toBe('contact-001');
      });
    });
  });

  describe('validateInvoice', () => {
    const validInvoice = {
      type: 'ACCREC' as const,
      contact: { contact_id: 'contact-001' },
      line_items: [{
        description: 'Test',
        quantity: 1,
        unit_amount: 100,
        account_code: '200',
        tax_type: 'OUTPUT',
      }],
    };

    it('should validate a valid invoice', async () => {
      const result = await adapter.validateInvoice('acme-au-001', validInvoice);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('should fail for invalid account code', async () => {
      const result = await adapter.validateInvoice('acme-au-001', {
        ...validInvoice,
        line_items: [{
          ...validInvoice.line_items[0],
          account_code: 'INVALID',
        }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail for archived account code', async () => {
      const result = await adapter.validateInvoice('acme-au-001', {
        ...validInvoice,
        line_items: [{
          ...validInvoice.line_items[0],
          account_code: '999',
        }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ARCHIVED'))).toBe(true);
    });

    it('should fail for invalid tax type', async () => {
      const result = await adapter.validateInvoice('acme-au-001', {
        ...validInvoice,
        line_items: [{
          ...validInvoice.line_items[0],
          tax_type: 'INVALID_TAX',
        }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('tax'))).toBe(true);
    });

    it('should fail for non-existent contact', async () => {
      const result = await adapter.validateInvoice('acme-au-001', {
        ...validInvoice,
        contact: { contact_id: 'non-existent' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('contact'))).toBe(true);
    });

    it('should warn for archived contact', async () => {
      const result = await adapter.validateInvoice('acme-au-001', {
        ...validInvoice,
        contact: { contact_id: 'contact-019' }, // Archived contact from fixture
      });
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should include diff details for errors', async () => {
      const result = await adapter.validateInvoice('acme-au-001', {
        ...validInvoice,
        line_items: [{
          ...validInvoice.line_items[0],
          account_code: 'INVALID',
        }],
      });
      expect(result.diff.length).toBeGreaterThan(0);
      expect(result.diff[0].field).toBeDefined();
      expect(result.diff[0].severity).toBe('error');
    });
  });

  describe('validateContact', () => {
    it('should validate a valid contact', async () => {
      const result = await adapter.validateContact('acme-au-001', {
        name: 'Test Contact',
        email: 'test@example.com',
      });
      expect(result.valid).toBe(true);
    });

    it('should fail for missing name', async () => {
      const result = await adapter.validateContact('acme-au-001', {
        email: 'test@example.com',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should fail for invalid email', async () => {
      const result = await adapter.validateContact('acme-au-001', {
        name: 'Test',
        email: 'invalid-email',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('email'))).toBe(true);
    });
  });
});
