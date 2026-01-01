import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { handleGetContact, type GetContactArgs } from '../../../src/tools/crud/get-contact.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('get_contact', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';
  const validContactId = 'contact-001';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearSimulation(tenantId);
  });

  const validArgs: GetContactArgs = {
    tenant_id: tenantId,
    contact_id: validContactId,
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should fetch an existing contact', async () => {
      const result = await handleGetContact(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).found).toBe(true);
      expect((result.data as any).contact).toBeDefined();
      expect((result.data as any).contact.contact_id).toBe(validContactId);
    });

    it('should return contact with all expected fields', async () => {
      const result = await handleGetContact(validArgs, adapter);

      expect(result.success).toBe(true);
      const contact = (result.data as any).contact;
      expect(contact.name).toBeDefined();
      expect(contact.status).toBeDefined();
      expect(typeof contact.is_customer).toBe('boolean');
      expect(typeof contact.is_supplier).toBe('boolean');
    });

    it('should return success true with meta information', async () => {
      const result = await handleGetContact(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.meta?.timestamp).toBeDefined();
      expect(result.meta?.request_id).toBeDefined();
      expect(result.meta?.execution_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include narrative in diagnostic verbosity', async () => {
      const result = await handleGetContact(validArgs, adapter);

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toBeDefined();
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('error handling', () => {
    it('should fail for non-existent contact', async () => {
      const result = await handleGetContact({
        ...validArgs,
        contact_id: 'non-existent-contact',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
    });

    it('should return recovery action for non-existent contact', async () => {
      const result = await handleGetContact({
        ...validArgs,
        contact_id: 'non-existent-contact',
      }, adapter);

      expect(result.success).toBe(false);
      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('list_contacts');
    });

    it('should fail for non-existent tenant', async () => {
      const result = await handleGetContact({
        ...validArgs,
        tenant_id: 'non-existent-tenant',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });
  });

  // ============================================
  // Chaos Simulation Tests
  // ============================================
  describe('chaos simulation', () => {
    it('should fail when rate limit simulation is active', async () => {
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleGetContact(validArgs, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('RATE_LIMIT');
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

      const result = await handleGetContact(validArgs, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleGetContact({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleGetContact({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
