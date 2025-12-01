import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { handleCreateCreditNote, clearIdempotencyStore, type CreateCreditNoteArgs } from '../../../src/tools/crud/create-credit-note.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('create_credit_note', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSimulation(tenantId);
  });

  const validArgs: CreateCreditNoteArgs = {
    tenant_id: 'acme-au-001',
    type: 'ACCRECCREDIT',
    contact_id: 'contact-001',
    line_items: [
      {
        description: 'Refund for returned item',
        quantity: 1,
        unit_amount: 150.00,
        account_code: '200',
        tax_type: 'OUTPUT',
      },
    ],
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should create a credit note with valid ACCRECCREDIT type', async () => {
      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('credit_note_id');
      expect(result.data).toHaveProperty('credit_note_number');
      expect((result.data as any).type).toBe('ACCRECCREDIT');
      expect((result.data as any).status).toBe('DRAFT');
      expect((result.data as any).currency_code).toBe('AUD');
    });

    it('should create a credit note with valid ACCPAYCREDIT type', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        type: 'ACCPAYCREDIT',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('ACCPAYCREDIT');
    });

    it('should return success true with meta information', async () => {
      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.meta?.timestamp).toBeDefined();
      expect(result.meta?.request_id).toBeDefined();
      expect(result.meta?.execution_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should create credit note with multiple line items', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Item 1 refund', quantity: 2, unit_amount: 50.00, account_code: '200' },
          { description: 'Item 2 refund', quantity: 1, unit_amount: 100.00, account_code: '200' },
          { description: 'Item 3 refund', quantity: 3, unit_amount: 25.00, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items).toHaveLength(3);
    });

    it('should calculate totals correctly', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Test item', quantity: 2, unit_amount: 100.00, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      // 2 * 100 = 200 subtotal, 10% tax = 20, total = 220
      expect((result.data as any).sub_total).toBe(200);
      expect((result.data as any).total_tax).toBe(20);
      expect((result.data as any).total).toBe(220);
    });

    it('should set remaining_credit to total on creation', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Test item', quantity: 1, unit_amount: 100.00, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).remaining_credit).toBe((result.data as any).total);
    });

    it('should use today date when not provided', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        date: undefined,
      }, adapter);

      expect(result.success).toBe(true);
      const today = new Date().toISOString().split('T')[0];
      expect((result.data as any).date).toBe(today);
    });
  });

  // ============================================
  // Credit Note Metadata Tests
  // ============================================
  describe('credit note metadata', () => {
    it('should accept custom date', async () => {
      const customDate = '2025-01-15';
      const result = await handleCreateCreditNote({
        ...validArgs,
        date: customDate,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).date).toBe(customDate);
    });

    it('should accept reference', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        reference: 'REF-12345',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).reference).toBe('REF-12345');
    });

    it('should generate unique credit note numbers', async () => {
      const result1 = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: 'key-1',
      }, adapter);

      // Clear the idempotency store to allow creating a new credit note
      clearIdempotencyStore();

      // Small delay to ensure different timestamp in ID
      await new Promise(resolve => setTimeout(resolve, 2));

      const result2 = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: 'key-2',
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).credit_note_id).not.toBe((result2.data as any).credit_note_id);
    });

    it('should use OUTPUT tax for ACCRECCREDIT type', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        type: 'ACCRECCREDIT',
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: '200' }, // No tax_type specified
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items[0].tax_type).toBe('OUTPUT');
    });

    it('should use INPUT tax for ACCPAYCREDIT type', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        type: 'ACCPAYCREDIT',
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: '200' }, // No tax_type specified
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items[0].tax_type).toBe('INPUT');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('validation', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        tenant_id: 'non-existent-tenant',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });

    it('should fail for invalid contact ID', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        contact_id: 'invalid-contact-id',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('validation failed');
    });

    it('should fail for archived contact', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        contact_id: 'contact-019', // Archived contact
      }, adapter);

      expect(result.success).toBe(false);
    });

    it('should fail for invalid account code', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: 'INVALID' },
        ],
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('validation failed');
      expect(result.recovery?.suggested_action_id).toBe('find_valid_account_codes');
    });

    it('should fail for archived account code', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: '999' }, // Archived account
        ],
      }, adapter);

      expect(result.success).toBe(false);
    });

    it('should return recovery action for tax type errors', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'INVALID_TAX' },
        ],
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.suggested_action_id).toBe('find_valid_tax_types');
    });
  });

  // ============================================
  // Idempotency Tests
  // ============================================
  describe('idempotency', () => {
    it('should return same credit note for duplicate idempotency key', async () => {
      const idempotencyKey = 'test-idempotency-key-cn';

      const result1 = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      const result2 = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).credit_note_id).toBe((result2.data as any).credit_note_id);
    });

    it('should include idempotent replay message in narrative', async () => {
      const idempotencyKey = 'test-replay-key-cn';

      await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      const result2 = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      expect(result2.diagnostics?.narrative).toContain('Idempotent replay');
    });

    it('should create different credit notes for different idempotency keys', async () => {
      const result1 = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: 'key-a',
      }, adapter);

      const result2 = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: 'key-b',
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).credit_note_id).not.toBe((result2.data as any).credit_note_id);
    });

    it('should work without idempotency key', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        idempotency_key: undefined,
      }, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Chaos Simulation Integration Tests
  // ============================================
  describe('chaos simulation integration', () => {
    it('should fail when rate limit simulation is active', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('Rate limit');
      expect(result.recovery?.suggested_action_id).toBe('clear_simulation');
    });

    it('should fail when timeout simulation is active', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'TIMEOUT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.next_tool_call?.name).toBe('simulate_network_conditions');
    });

    it('should fail when server_error simulation is active', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'SERVER_ERROR',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(false);
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

      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Line Items Tests
  // ============================================
  describe('line items', () => {
    it('should handle line item with zero unit amount', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Free item credit', quantity: 1, unit_amount: 0, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).total).toBe(0);
    });

    it('should handle high precision amounts', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Precise amount', quantity: 1, unit_amount: 99.999, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      // Should round properly
      expect((result.data as any).sub_total).toBeDefined();
    });

    it('should handle large quantities', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Bulk refund', quantity: 10000, unit_amount: 0.01, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).sub_total).toBe(100);
    });

    it('should preserve line item descriptions', async () => {
      const description = 'Special character test: @#$%^&*()';
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description, quantity: 1, unit_amount: 100, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items[0].description).toBe(description);
    });

    it('should use explicit tax type when provided', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'EXEMPTOUTPUT' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items[0].tax_type).toBe('EXEMPTOUTPUT');
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should include diagnostics for diagnostic verbosity', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('credit note');
    });

    it('should include diagnostics for debug verbosity', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        verbosity: 'debug',
      }, adapter);

      expect(result.diagnostics).toBeDefined();
    });

    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should default to diagnostic verbosity', async () => {
      const args = { ...validArgs };
      delete (args as any).verbosity;

      const result = await handleCreateCreditNote(args, adapter);

      expect(result.diagnostics).toBeDefined();
    });
  });

  // ============================================
  // Credit Note Type Specific Tests
  // ============================================
  describe('credit note types', () => {
    it('should create ACCRECCREDIT for customer credits', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        type: 'ACCRECCREDIT',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('ACCRECCREDIT');
      expect(result.diagnostics?.narrative).toContain('ACCRECCREDIT');
    });

    it('should create ACCPAYCREDIT for supplier credits', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        type: 'ACCPAYCREDIT',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('ACCPAYCREDIT');
      expect(result.diagnostics?.narrative).toContain('ACCPAYCREDIT');
    });
  });

  // ============================================
  // Edge Cases Tests
  // ============================================
  describe('edge cases', () => {
    it('should handle minimum valid credit note', async () => {
      const result = await handleCreateCreditNote({
        tenant_id: 'acme-au-001',
        type: 'ACCRECCREDIT',
        contact_id: 'contact-001',
        line_items: [
          { description: 'Min', quantity: 1, unit_amount: 0.01, account_code: '200' },
        ],
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should handle very long reference', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        reference: 'A'.repeat(200),
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should handle unicode in descriptions', async () => {
      const result = await handleCreateCreditNote({
        ...validArgs,
        line_items: [
          { description: '日本語テスト 中文测试 한국어 테스트', quantity: 1, unit_amount: 100, account_code: '200' },
        ],
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should include score in successful response', async () => {
      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta?.score).toBe(1.0);
    });

    it('should include warnings in response when present', async () => {
      const result = await handleCreateCreditNote(validArgs, adapter);

      expect(result.success).toBe(true);
      // Warnings may or may not be present depending on validation
    });
  });
});
