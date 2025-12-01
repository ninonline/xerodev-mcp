import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleSimulateNetwork,
  checkSimulation,
  getActiveSimulation,
  clearSimulation,
} from '../../../src/tools/chaos/simulate-network.js';

describe('simulate_network_conditions', () => {
  const tenantId = 'acme-au-001';

  beforeEach(() => {
    // Clear any active simulations before each test
    clearSimulation(tenantId);
  });

  describe('activating simulations', () => {
    it('should activate RATE_LIMIT simulation', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('active');
      expect(result.data.condition).toBe('RATE_LIMIT');
    });

    it('should activate TIMEOUT simulation', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'TIMEOUT',
        duration_seconds: 30,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.condition).toBe('TIMEOUT');
    });

    it('should activate SERVER_ERROR simulation', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'SERVER_ERROR',
        duration_seconds: 30,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.condition).toBe('SERVER_ERROR');
    });

    it('should activate TOKEN_EXPIRED simulation', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'TOKEN_EXPIRED',
        duration_seconds: 30,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.condition).toBe('TOKEN_EXPIRED');
    });

    it('should activate INTERMITTENT simulation with custom failure rate', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'INTERMITTENT',
        duration_seconds: 30,
        failure_rate: 0.5,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.condition).toBe('INTERMITTENT');
      expect(result.data.failure_rate).toBe(0.5);
    });
  });

  describe('checkSimulation behaviour', () => {
    it('should return failure for RATE_LIMIT simulation', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const check = checkSimulation(tenantId);
      expect(check.shouldFail).toBe(true);
      expect(check.error?.type).toBe('RATE_LIMIT');
      expect(check.error?.status).toBe(429);
    });

    it('should return failure for TIMEOUT simulation', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'TIMEOUT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const check = checkSimulation(tenantId);
      expect(check.shouldFail).toBe(true);
      expect(check.error?.type).toBe('TIMEOUT');
      expect(check.error?.status).toBe(408);
    });

    it('should return failure for SERVER_ERROR simulation', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'SERVER_ERROR',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const check = checkSimulation(tenantId);
      expect(check.shouldFail).toBe(true);
      expect(check.error?.type).toBe('SERVER_ERROR');
      expect([500, 502, 503]).toContain(check.error?.status);
    });

    it('should return failure for TOKEN_EXPIRED simulation', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'TOKEN_EXPIRED',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const check = checkSimulation(tenantId);
      expect(check.shouldFail).toBe(true);
      expect(check.error?.type).toBe('TOKEN_EXPIRED');
      expect(check.error?.status).toBe(401);
    });

    it('should sometimes pass for INTERMITTENT simulation', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'INTERMITTENT',
        duration_seconds: 60,
        failure_rate: 0.5,
        verbosity: 'diagnostic',
      });

      // Run multiple checks - with 50% failure rate, we should see both outcomes
      const results: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        const check = checkSimulation(tenantId);
        results.push(check.shouldFail);
      }

      // With 50% rate and 20 tries, we should have at least one of each
      expect(results).toContain(true);
      expect(results).toContain(false);
    });

    it('should not fail when no simulation is active', () => {
      const check = checkSimulation(tenantId);
      expect(check.shouldFail).toBe(false);
      expect(check.error).toBeUndefined();
    });

    it('should increment request count on each check', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      checkSimulation(tenantId);
      checkSimulation(tenantId);
      checkSimulation(tenantId);

      const sim = getActiveSimulation(tenantId);
      expect(sim?.request_count).toBe(3);
    });
  });

  describe('clearing simulations', () => {
    it('should clear simulation with duration_seconds=0', async () => {
      // First activate a simulation
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(getActiveSimulation(tenantId)).not.toBeNull();

      // Now clear it
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 0,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('cleared');
      expect(getActiveSimulation(tenantId)).toBeNull();
    });

    it('should report previous simulation stats when clearing', async () => {
      // Activate and make some requests
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'SERVER_ERROR',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      checkSimulation(tenantId);
      checkSimulation(tenantId);
      checkSimulation(tenantId);

      // Clear and check stats
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'SERVER_ERROR',
        duration_seconds: 0,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.data.previous_simulation).toBeDefined();
      expect(result.data.previous_simulation?.condition).toBe('SERVER_ERROR');
      expect(result.data.previous_simulation?.request_count).toBe(3);
    });

    it('should handle clearing non-existent simulation gracefully', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 0,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('cleared');
      expect(result.data.previous_simulation).toBeUndefined();
    });
  });

  describe('replacing simulations', () => {
    it('should replace existing simulation with new one', async () => {
      // Start with RATE_LIMIT
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      // Replace with TIMEOUT
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'TIMEOUT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.condition).toBe('TIMEOUT');
      expect(result.data.previous_simulation?.condition).toBe('RATE_LIMIT');
    });
  });

  describe('verbosity levels', () => {
    it('should include narrative in diagnostic mode', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.diagnostics?.narrative).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('RATE_LIMIT');
    });

    it('should include warnings in response', async () => {
      const result = await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      expect(result.diagnostics?.warnings).toBeDefined();
      expect(result.diagnostics!.warnings!.length).toBeGreaterThan(0);
    });
  });

  describe('multiple tenants', () => {
    it('should isolate simulations per tenant', async () => {
      const tenantA = 'tenant-a';
      const tenantB = 'tenant-b';

      await handleSimulateNetwork({
        tenant_id: tenantA,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      // tenantA should fail
      expect(checkSimulation(tenantA).shouldFail).toBe(true);

      // tenantB should not fail
      expect(checkSimulation(tenantB).shouldFail).toBe(false);

      // Cleanup
      clearSimulation(tenantA);
    });
  });
});
