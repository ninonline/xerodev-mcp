import { describe, it, expect, beforeAll } from 'vitest';
import { handleValidateSchema } from '../../../src/tools/validation/validate-schema.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('validate_schema_match', () => {
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

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  describe('Invoice validation', () => {
    it('should pass a valid invoice', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: validInvoice,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(true);
      expect(result.data.score).toBe(1.0);
    });

    it('should fail invoice with non-existent AccountCode', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            ...validInvoice,
            line_items: [{
              ...validInvoice.line_items[0],
              account_code: 'INVALID_CODE',
            }],
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.valid).toBe(false);
      expect(result.data.errors).toBeDefined();
      expect(result.data.errors?.some(e => e.includes('account_code'))).toBe(true);
    });

    it('should return recovery action for invalid AccountCode', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            ...validInvoice,
            line_items: [{
              ...validInvoice.line_items[0],
              account_code: 'INVALID_CODE',
            }],
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('introspect_enums');
      expect(result.recovery?.next_tool_call?.arguments.entity_type).toBe('Account');
    });

    it('should fail invoice with archived AccountCode', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            ...validInvoice,
            line_items: [{
              ...validInvoice.line_items[0],
              account_code: '999', // Archived account from fixture
            }],
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.errors?.some(e => e.includes('ARCHIVED'))).toBe(true);
    });

    it('should fail invoice with invalid TaxType', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            ...validInvoice,
            line_items: [{
              ...validInvoice.line_items[0],
              tax_type: 'INVALID_TAX',
            }],
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.errors?.some(e => e.toLowerCase().includes('tax'))).toBe(true);
    });

    it('should return recovery action for invalid TaxType', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            ...validInvoice,
            line_items: [{
              ...validInvoice.line_items[0],
              tax_type: 'INVALID_TAX',
            }],
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.recovery?.next_tool_call?.arguments.entity_type).toBe('TaxRate');
    });

    it('should fail invoice with non-existent ContactID', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            ...validInvoice,
            contact: { contact_id: 'non-existent-contact' },
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.errors?.some(e => e.toLowerCase().includes('contact'))).toBe(true);
    });

    it('should fail invoice with missing required fields', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            type: 'ACCREC',
            // Missing contact and line_items
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.valid).toBe(false);
    });

    it('should include diff information', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Invoice',
          payload: {
            ...validInvoice,
            line_items: [{
              ...validInvoice.line_items[0],
              account_code: 'INVALID_CODE',
            }],
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.diff).toBeDefined();
      expect(result.data.diff?.length).toBeGreaterThan(0);
      expect(result.data.diff?.[0].severity).toBe('error');
    });
  });

  describe('Contact validation', () => {
    it('should pass a valid contact', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Contact',
          payload: {
            name: 'Test Contact',
            email: 'test@example.com',
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(true);
    });

    it('should fail contact with missing name', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Contact',
          payload: {
            email: 'test@example.com',
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.errors?.some(e => e.includes('name'))).toBe(true);
    });

    it('should fail contact with invalid email format', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'acme-au-001',
          entity_type: 'Contact',
          payload: {
            name: 'Test Contact',
            email: 'invalid-email',
          },
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.data.errors?.some(e => e.toLowerCase().includes('email'))).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleValidateSchema(
        {
          tenant_id: 'non-existent',
          entity_type: 'Invoice',
          payload: validInvoice,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
    });
  });
});
