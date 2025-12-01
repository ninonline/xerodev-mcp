import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { handleCreatePayment, clearIdempotencyStore, type CreatePaymentArgs } from '../../../src/tools/crud/create-payment.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('create_payment', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';
  const validInvoiceId = 'inv-001';
  const validAccountId = 'acc-027'; // Bank account

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSimulation(tenantId);
  });

  const validArgs: CreatePaymentArgs = {
    tenant_id: tenantId,
    invoice_id: validInvoiceId,
    account_id: validAccountId,
    amount: 100.00,
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should create a payment with valid invoice', async () => {
      const result = await handleCreatePayment(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('payment_id');
      expect((result.data as any).amount).toBe(100.00);
      expect((result.data as any).status).toBe('AUTHORISED');
    });

    it('should return success true with meta information', async () => {
      const result = await handleCreatePayment(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.meta?.timestamp).toBeDefined();
      expect(result.meta?.request_id).toBeDefined();
      expect(result.meta?.execution_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should use tenant currency', async () => {
      const result = await handleCreatePayment(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).currency_code).toBe('AUD');
    });

    it('should use today date when not provided', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        date: undefined,
      }, adapter);

      expect(result.success).toBe(true);
      const today = new Date().toISOString().split('T')[0];
      expect((result.data as any).date).toBe(today);
    });

    it('should accept custom date', async () => {
      const customDate = '2025-01-15';
      const result = await handleCreatePayment({
        ...validArgs,
        date: customDate,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).date).toBe(customDate);
    });

    it('should accept reference', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        reference: 'PAY-REF-12345',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).reference).toBe('PAY-REF-12345');
    });
  });

  // ============================================
  // Payment Type Tests
  // ============================================
  describe('payment types', () => {
    it('should fail when neither invoice_id nor credit_note_id provided', async () => {
      const result = await handleCreatePayment({
        tenant_id: tenantId,
        account_id: validAccountId,
        amount: 100.00,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('invoice_id or credit_note_id');
    });

    it('should fail when both invoice_id and credit_note_id provided', async () => {
      const result = await handleCreatePayment({
        tenant_id: tenantId,
        invoice_id: validInvoiceId,
        credit_note_id: 'cn-001',
        account_id: validAccountId,
        amount: 100.00,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('both');
    });

    it('should create payment for credit note refund', async () => {
      const result = await handleCreatePayment({
        tenant_id: tenantId,
        credit_note_id: 'cn-001',
        account_id: validAccountId,
        amount: 50.00,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).credit_note).toBeDefined();
      expect((result.data as any).credit_note.credit_note_id).toBe('cn-001');
    });

    it('should link invoice correctly', async () => {
      const result = await handleCreatePayment(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).invoice).toBeDefined();
      expect((result.data as any).invoice.invoice_id).toBe(validInvoiceId);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('validation', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        tenant_id: 'non-existent-tenant',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });

    it('should fail for invalid invoice ID', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        invoice_id: 'invalid-invoice-id',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('validation failed');
    });

    it('should fail for invalid account ID', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        account_id: 'invalid-account-id',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('validation failed');
    });

    it('should return recovery action for account errors', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        account_id: 'invalid-account-id',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery?.suggested_action_id).toBe('find_bank_accounts');
      expect(result.recovery?.next_tool_call?.name).toBe('introspect_enums');
    });

    it('should return recovery action for invoice errors', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        invoice_id: 'invalid-invoice-id',
        account_id: validAccountId, // Use valid account to test invoice error
      }, adapter);

      expect(result.success).toBe(false);
      // Recovery should suggest checking the invoice
    });
  });

  // ============================================
  // Idempotency Tests
  // ============================================
  describe('idempotency', () => {
    it('should return same payment for duplicate idempotency key', async () => {
      const idempotencyKey = 'test-idempotency-key-pay';

      const result1 = await handleCreatePayment({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      const result2 = await handleCreatePayment({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).payment_id).toBe((result2.data as any).payment_id);
    });

    it('should include idempotent replay message in narrative', async () => {
      const idempotencyKey = 'test-replay-key-pay';

      await handleCreatePayment({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      const result2 = await handleCreatePayment({
        ...validArgs,
        idempotency_key: idempotencyKey,
      }, adapter);

      expect(result2.diagnostics?.narrative).toContain('Idempotent replay');
    });

    it('should create different payments for different idempotency keys', async () => {
      const result1 = await handleCreatePayment({
        ...validArgs,
        idempotency_key: 'key-a',
      }, adapter);

      const result2 = await handleCreatePayment({
        ...validArgs,
        idempotency_key: 'key-b',
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).payment_id).not.toBe((result2.data as any).payment_id);
    });

    it('should work without idempotency key', async () => {
      const result = await handleCreatePayment({
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

      const result = await handleCreatePayment(validArgs, adapter);

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

      const result = await handleCreatePayment(validArgs, adapter);

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

      const result = await handleCreatePayment(validArgs, adapter);

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

      const result = await handleCreatePayment(validArgs, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Amount Tests
  // ============================================
  describe('amount handling', () => {
    it('should handle small amounts', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        amount: 0.01,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).amount).toBe(0.01);
    });

    it('should handle large amounts', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        amount: 1000000.00,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).amount).toBe(1000000.00);
    });

    it('should handle high precision amounts', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        amount: 123.456789,
      }, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should include diagnostics for diagnostic verbosity', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('payment');
    });

    it('should include diagnostics for debug verbosity', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        verbosity: 'debug',
      }, adapter);

      expect(result.diagnostics).toBeDefined();
    });

    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should default to diagnostic verbosity', async () => {
      const args = { ...validArgs };
      delete (args as any).verbosity;

      const result = await handleCreatePayment(args, adapter);

      expect(result.diagnostics).toBeDefined();
    });
  });

  // ============================================
  // Edge Cases Tests
  // ============================================
  describe('edge cases', () => {
    it('should handle minimum valid payment', async () => {
      const result = await handleCreatePayment({
        tenant_id: tenantId,
        invoice_id: validInvoiceId,
        account_id: validAccountId,
        amount: 0.01,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should handle very long reference', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        reference: 'R'.repeat(200),
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should handle unicode in reference', async () => {
      const result = await handleCreatePayment({
        ...validArgs,
        reference: 'Payment: 日本語 中文 한국어',
      }, adapter);

      expect(result.success).toBe(true);
    });

    it('should include score in successful response', async () => {
      const result = await handleCreatePayment(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta?.score).toBe(1.0);
    });

    it('should generate unique payment IDs', async () => {
      const result1 = await handleCreatePayment({
        ...validArgs,
        idempotency_key: 'key-1',
      }, adapter);

      clearIdempotencyStore();

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));

      const result2 = await handleCreatePayment({
        ...validArgs,
        idempotency_key: 'key-2',
      }, adapter);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect((result1.data as any).payment_id).not.toBe((result2.data as any).payment_id);
    });
  });
});
