import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  handleCreateContact,
  clearContactIdempotencyStore,
  getContactFromIdempotencyStore,
} from '../../../src/tools/crud/create-contact.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('create_contact', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearContactIdempotencyStore();
    clearSimulation(tenantId);
  });

  describe('basic functionality', () => {
    it('should create a contact with required fields only', async () => {
      const result = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Test Contact',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.contact.name).toBe('Test Contact');
      expect(result.data.contact.contact_id).toMatch(/^contact-/);
      expect(result.data.contact.status).toBe('ACTIVE');
      expect(result.data.was_duplicate).toBe(false);
    });

    it('should create a contact with all optional fields', async () => {
      const result = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Full Contact',
          email: 'test@example.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+61 2 1234 5678',
          is_customer: true,
          is_supplier: true,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.contact.email).toBe('test@example.com');
      expect(result.data.contact.first_name).toBe('John');
      expect(result.data.contact.last_name).toBe('Doe');
      expect(result.data.contact.phone).toBe('+61 2 1234 5678');
      expect(result.data.contact.is_customer).toBe(true);
      expect(result.data.contact.is_supplier).toBe(true);
    });

    it('should set created_at timestamp', async () => {
      const before = new Date().toISOString();

      const result = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Timestamp Test',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      const after = new Date().toISOString();
      expect(result.data.contact.created_at >= before).toBe(true);
      expect(result.data.contact.created_at <= after).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('should return existing contact when using same idempotency key', async () => {
      const key = 'test-idem-key-123';

      // First call
      const result1 = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Idempotency Test',
          idempotency_key: key,
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      // Second call with same key
      const result2 = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Different Name',
          idempotency_key: key,
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result1.data.contact.contact_id).toBe(result2.data.contact.contact_id);
      expect(result2.data.was_duplicate).toBe(true);
      expect(result2.data.contact.name).toBe('Idempotency Test'); // Uses original name
    });

    it('should create new contact with different idempotency key', async () => {
      const result1 = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Contact One',
          idempotency_key: 'key-1',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      const result2 = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Contact Two',
          idempotency_key: 'key-2',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result1.data.contact.contact_id).not.toBe(result2.data.contact.contact_id);
      expect(result2.data.was_duplicate).toBe(false);
    });

    it('should store contact in idempotency store', async () => {
      const key = 'store-test-key';

      await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Store Test',
          idempotency_key: key,
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      const stored = getContactFromIdempotencyStore(key);
      expect(stored).toBeDefined();
      expect(stored?.name).toBe('Store Test');
    });
  });

  describe('tenant validation', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleCreateContact(
        {
          tenant_id: 'non-existent-tenant',
          name: 'Test',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.diagnostics?.narrative).toContain('not found');
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });
  });

  describe('chaos simulation integration', () => {
    it('should fail when network simulation is active', async () => {
      // Activate simulation
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'RATE_LIMIT',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Should Fail',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.diagnostics?.narrative).toContain('RATE_LIMIT');
      expect(result.recovery?.next_tool_call?.name).toBe('simulate_network_conditions');
    });

    it('should succeed after simulation is cleared', async () => {
      // Activate then clear simulation
      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'SERVER_ERROR',
        duration_seconds: 60,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      await handleSimulateNetwork({
        tenant_id: tenantId,
        condition: 'SERVER_ERROR',
        duration_seconds: 0,
        failure_rate: 1.0,
        verbosity: 'diagnostic',
      });

      const result = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Should Succeed',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
    });
  });

  describe('verbosity levels', () => {
    it('should include narrative in diagnostic mode', async () => {
      const result = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Verbosity Test',
          is_customer: true,
          is_supplier: false,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.diagnostics?.narrative).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('Created contact');
    });

    it('should mention customer/supplier status in narrative', async () => {
      const result = await handleCreateContact(
        {
          tenant_id: tenantId,
          name: 'Both Types',
          is_customer: true,
          is_supplier: true,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.diagnostics?.narrative).toContain('customer');
      expect(result.diagnostics?.narrative).toContain('supplier');
    });
  });
});
