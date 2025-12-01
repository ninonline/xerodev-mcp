import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleReplayIdempotency,
  getIdempotencyRecord,
  clearIdempotencyStore,
} from '../../../src/tools/chaos/replay-idempotency.js';

describe('replay_idempotency', () => {
  const tenantId = 'acme-au-001';
  const samplePayload = {
    type: 'ACCREC',
    contact: { contact_id: 'contact-001' },
    line_items: [{ description: 'Test', quantity: 1, unit_amount: 100 }],
  };

  beforeEach(() => {
    clearIdempotencyStore();
  });

  describe('basic functionality', () => {
    it('should maintain idempotency across multiple replays', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 5,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.idempotency_maintained).toBe(true);
      expect(result.data.unique_result_ids.length).toBe(1);
    });

    it('should generate idempotency key if not provided', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'diagnostic',
      });

      expect(result.data.idempotency_key).toMatch(/^idem-/);
    });

    it('should use provided idempotency key', async () => {
      const customKey = 'my-custom-key-12345';

      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        idempotency_key: customKey,
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'diagnostic',
      });

      expect(result.data.idempotency_key).toBe(customKey);
    });
  });

  describe('replay attempts', () => {
    it('should record all replay attempts', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'debug',
      });

      expect(result.data.attempts.length).toBe(3);
      expect(result.data.attempts[0].attempt).toBe(1);
      expect(result.data.attempts[1].attempt).toBe(2);
      expect(result.data.attempts[2].attempt).toBe(3);
    });

    it('should mark first attempt as not cached', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'debug',
      });

      expect(result.data.attempts[0].was_cached).toBe(false);
    });

    it('should mark subsequent attempts as cached', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'debug',
      });

      expect(result.data.attempts[1].was_cached).toBe(true);
      expect(result.data.attempts[2].was_cached).toBe(true);
    });

    it('should return same result_id for all attempts', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'debug',
      });

      const firstId = result.data.attempts[0].result_id;
      result.data.attempts.forEach(attempt => {
        expect(attempt.result_id).toBe(firstId);
      });
    });
  });

  describe('summary statistics', () => {
    it('should count total attempts correctly', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 5,
        verbosity: 'diagnostic',
      });

      expect(result.data.summary.total_attempts).toBe(5);
    });

    it('should count cached responses correctly', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 5,
        verbosity: 'diagnostic',
      });

      expect(result.data.summary.cached_responses).toBe(4);
      expect(result.data.summary.new_creations).toBe(1);
    });
  });

  describe('operations', () => {
    it('should handle create_invoice operation', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 2,
        verbosity: 'diagnostic',
      });

      expect(result.data.operation).toBe('create_invoice');
      expect(result.data.attempts[0].result_id).toMatch(/^invoice-/);
    });

    it('should handle create_contact operation', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_contact',
        payload: { name: 'Test Contact', email: 'test@example.com' },
        replay_count: 2,
        verbosity: 'diagnostic',
      });

      expect(result.data.operation).toBe('create_contact');
      expect(result.data.attempts[0].result_id).toMatch(/^contact-/);
    });

    it('should handle create_payment operation', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_payment',
        payload: { invoice_id: 'inv-001', amount: 100 },
        replay_count: 2,
        verbosity: 'diagnostic',
      });

      expect(result.data.operation).toBe('create_payment');
      expect(result.data.attempts[0].result_id).toMatch(/^payment-/);
    });
  });

  describe('idempotency store', () => {
    it('should store idempotency record', async () => {
      const key = 'test-key-123';

      await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        idempotency_key: key,
        payload: samplePayload,
        replay_count: 1,
        verbosity: 'diagnostic',
      });

      const record = getIdempotencyRecord(key);
      expect(record).toBeDefined();
      expect(record?.key).toBe(key);
      expect(record?.operation).toBe('create_invoice');
      expect(record?.tenant_id).toBe(tenantId);
    });

    it('should track replay count in store', async () => {
      const key = 'test-key-456';

      await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        idempotency_key: key,
        payload: samplePayload,
        replay_count: 5,
        verbosity: 'diagnostic',
      });

      const record = getIdempotencyRecord(key);
      expect(record?.replay_count).toBe(5);
    });

    it('should reuse existing idempotency record on separate calls', async () => {
      const key = 'shared-key-789';

      // First call
      await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        idempotency_key: key,
        payload: samplePayload,
        replay_count: 2,
        verbosity: 'diagnostic',
      });

      const firstRecord = getIdempotencyRecord(key);
      const firstResultId = firstRecord?.result_id;

      // Second call with same key
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        idempotency_key: key,
        payload: samplePayload,
        replay_count: 2,
        verbosity: 'debug',
      });

      // All attempts should be cached and have same ID
      expect(result.data.attempts.every(a => a.was_cached)).toBe(true);
      expect(result.data.attempts.every(a => a.result_id === firstResultId)).toBe(true);
    });
  });

  describe('verbosity levels', () => {
    it('should limit attempts in non-debug mode', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 10,
        verbosity: 'diagnostic',
      });

      expect(result.data.attempts.length).toBeLessThanOrEqual(3);
    });

    it('should show all attempts in debug mode', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 10,
        verbosity: 'debug',
      });

      expect(result.data.attempts.length).toBe(10);
    });

    it('should include narrative in diagnostic mode', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'diagnostic',
      });

      expect(result.diagnostics?.narrative).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('Idempotency test passed');
    });
  });

  describe('edge cases', () => {
    it('should handle single replay', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 1,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.summary.total_attempts).toBe(1);
      expect(result.data.summary.new_creations).toBe(1);
      expect(result.data.summary.cached_responses).toBe(0);
    });

    it('should handle maximum replays', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 10,
        verbosity: 'debug',
      });

      expect(result.success).toBe(true);
      expect(result.data.summary.total_attempts).toBe(10);
    });

    it('should include response times for each attempt', async () => {
      const result = await handleReplayIdempotency({
        tenant_id: tenantId,
        operation: 'create_invoice',
        payload: samplePayload,
        replay_count: 3,
        verbosity: 'debug',
      });

      result.data.attempts.forEach(attempt => {
        expect(attempt.response_time_ms).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
