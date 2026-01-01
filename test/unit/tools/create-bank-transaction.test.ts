import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { handleCreateBankTransaction, clearIdempotencyStore, type CreateBankTransactionArgs } from '../../../src/tools/crud/create-bank-transaction.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('create_bank_transaction', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';
  const validBankAccountId = 'acc-bank-090'; // Bank account (code 090)
  const validContactId = 'contact-001';
  const validAccountCode = '200'; // Revenue account

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSimulation(tenantId);
  });

  const validArgs: CreateBankTransactionArgs = {
    tenant_id: tenantId,
    type: 'RECEIVE',
    bank_account_id: validBankAccountId,
    contact_id: validContactId,
    line_items: [
      {
        description: 'Customer payment',
        quantity: 1,
        unit_amount: 500.00,
        account_code: validAccountCode,
        tax_type: 'OUTPUT',
      },
    ],
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should create a RECEIVE bank transaction', async () => {
      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('bank_transaction_id');
      expect((result.data as any).type).toBe('RECEIVE');
      expect((result.data as any).status).toBe('DRAFT');
    });

    it('should create a SPEND bank transaction', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        type: 'SPEND',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('SPEND');
    });

    it('should return success true with meta information', async () => {
      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.meta?.timestamp).toBeDefined();
      expect(result.meta?.request_id).toBeDefined();
      expect(result.meta?.execution_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should create bank transaction with multiple line items', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Item 1', quantity: 1, unit_amount: 100.00, account_code: validAccountCode },
          { description: 'Item 2', quantity: 2, unit_amount: 50.00, account_code: validAccountCode },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items).toHaveLength(2);
    });

    it('should calculate totals correctly', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Item 1', quantity: 2, unit_amount: 100.00, account_code: validAccountCode },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      // 2 * 100 = 200 subtotal, 10% tax = 20, total = 220
      expect((result.data as any).sub_total).toBe(200);
      expect((result.data as any).total_tax).toBe(20);
      expect((result.data as any).total).toBe(220);
    });

    it('should use tenant currency', async () => {
      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).currency_code).toBe('AUD');
    });

    it('should use today date when not provided', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        date: undefined,
      }, adapter);

      expect(result.success).toBe(true);
      const today = new Date().toISOString().split('T')[0];
      expect((result.data as any).date).toBe(today);
    });
  });

  // ============================================
  // Transaction Type Tests
  // ============================================
  describe('transaction types', () => {
    it('should create RECEIVE-OVERPAYMENT transaction', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        type: 'RECEIVE-OVERPAYMENT',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('RECEIVE-OVERPAYMENT');
    });

    it('should create RECEIVE-PREPAYMENT transaction', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        type: 'RECEIVE-PREPAYMENT',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('RECEIVE-PREPAYMENT');
    });

    it('should create SPEND-OVERPAYMENT transaction', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        type: 'SPEND-OVERPAYMENT',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('SPEND-OVERPAYMENT');
    });

    it('should create SPEND-PREPAYMENT transaction', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        type: 'SPEND-PREPAYMENT',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe('SPEND-PREPAYMENT');
    });

    it('should use OUTPUT tax for RECEIVE type', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        type: 'RECEIVE',
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: validAccountCode }, // No tax_type
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items[0].tax_type).toBe('OUTPUT');
    });

    it('should use INPUT tax for SPEND type', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        type: 'SPEND',
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: validAccountCode }, // No tax_type
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items[0].tax_type).toBe('INPUT');
    });
  });

  // ============================================
  // Metadata Tests
  // ============================================
  describe('metadata', () => {
    it('should accept custom date', async () => {
      const customDate = '2025-01-15';
      const result = await handleCreateBankTransaction({
        ...validArgs,
        date: customDate,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).date).toBe(customDate);
    });

    it('should accept reference', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        reference: 'TXN-REF-12345',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).reference).toBe('TXN-REF-12345');
    });

    it('should link bank account correctly', async () => {
      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).bank_account).toBeDefined();
      expect((result.data as any).bank_account.account_id).toBe(validBankAccountId);
    });

    it('should link contact when provided', async () => {
      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).contact).toBeDefined();
      expect((result.data as any).contact.contact_id).toBe(validContactId);
    });

    it('should work without contact', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        contact_id: undefined,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).contact).toBeUndefined();
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('validation', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        tenant_id: 'non-existent-tenant',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });

    it('should fail for invalid bank account ID', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        bank_account_id: 'invalid-bank-account',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('validation failed');
    });

    it('should return recovery action for bank account errors', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        bank_account_id: 'invalid-bank-account',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.suggested_action_id).toBe('find_bank_accounts');
    });

    it('should fail for invalid account code in line items', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: 'INVALID' },
        ],
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.suggested_action_id).toBe('find_valid_account_codes');
    });

    it('should fail for archived account code', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: '999' }, // Archived account
        ],
      }, adapter);

      expect(result.success).toBe(false);
    });

    it('should return recovery action for tax type errors', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: validAccountCode, tax_type: 'INVALID_TAX' },
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
    it('should return same transaction for duplicate idempotency key', async () => {
      const idempotencyKey = 'test-idempotency-key-bt';

      const result1 = await handleCreateBankTransaction({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      const result2 = await handleCreateBankTransaction({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).bank_transaction_id).toBe((result2.data as any).bank_transaction_id);
    });

    it('should include idempotent replay message in narrative', async () => {
      const idempotencyKey = 'test-replay-key-bt';

      await handleCreateBankTransaction({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      const result2 = await handleCreateBankTransaction({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      expect(result2.diagnostics?.narrative).toContain('Idempotent replay');
    });

    it('should create different transactions for different idempotency keys', async () => {
      const result1 = await handleCreateBankTransaction({
        ...validArgs,
        idempotency_key: 'key-a',
      }, adapter);

      const result2 = await handleCreateBankTransaction({
        ...validArgs,
        idempotency_key: 'key-b',
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).bank_transaction_id).not.toBe((result2.data as any).bank_transaction_id);
    });

    it('should work without idempotency key', async () => {
      const result = await handleCreateBankTransaction({
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

      const result = await handleCreateBankTransaction(validArgs, adapter);

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

      const result = await handleCreateBankTransaction(validArgs, adapter);

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

      const result = await handleCreateBankTransaction(validArgs, adapter);

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

      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Line Items Tests
  // ============================================
  describe('line items', () => {
    it('should handle line item with zero unit amount', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Free item', quantity: 1, unit_amount: 0, account_code: validAccountCode },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).total).toBe(0);
    });

    it('should handle high precision amounts', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Precise amount', quantity: 1, unit_amount: 99.999, account_code: validAccountCode },
        ],
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should handle large quantities', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Bulk', quantity: 10000, unit_amount: 0.01, account_code: validAccountCode },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).sub_total).toBe(100);
    });

    it('should preserve line item descriptions', async () => {
      const description = 'Special character test: @#$%^&*()';
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description, quantity: 1, unit_amount: 100, account_code: validAccountCode },
        ],
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).line_items[0].description).toBe(description);
    });

    it('should use explicit tax type when provided', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: 'Item', quantity: 1, unit_amount: 100, account_code: validAccountCode, tax_type: 'EXEMPTOUTPUT' },
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
      const result = await handleCreateBankTransaction({
        ...validArgs,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('bank transaction');
    });

    it('should include diagnostics for debug verbosity', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        verbosity: 'debug',
      }, adapter);

      expect(result.diagnostics).toBeDefined();
    });

    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should default to diagnostic verbosity', async () => {
      const args = { ...validArgs };
      delete (args as any).verbosity;

      const result = await handleCreateBankTransaction(args, adapter);

      expect(result.diagnostics).toBeDefined();
    });
  });

  // ============================================
  // Edge Cases Tests
  // ============================================
  describe('edge cases', () => {
    it('should handle minimum valid bank transaction', async () => {
      const result = await handleCreateBankTransaction({
        tenant_id: tenantId,
        type: 'RECEIVE',
        bank_account_id: validBankAccountId,
        line_items: [
          { description: 'Min', quantity: 1, unit_amount: 0.01, account_code: validAccountCode },
        ],
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should handle very long reference', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        reference: 'R'.repeat(200),
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should handle unicode in descriptions', async () => {
      const result = await handleCreateBankTransaction({
        ...validArgs,
        line_items: [
          { description: '日本語テスト 中文测试 한국어 테스트', quantity: 1, unit_amount: 100, account_code: validAccountCode },
        ],
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should include score in successful response', async () => {
      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta?.score).toBe(1.0);
    });

    it('should set is_reconciled to false on creation', async () => {
      const result = await handleCreateBankTransaction(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).is_reconciled).toBe(false);
    });
  });
});
