import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { handleUpdateContact } from '../../../src/tools/crud/update-contact.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('update_contact', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    // Reset is handled by the mock adapter automatically
  });

  describe('basic functionality', () => {
    it('should update contact name', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-001',
          name: 'Updated Contact Name',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.contact.name).toBe('Updated Contact Name');
      expect(result.data.updated_fields).toContain('name');
    });

    it('should update contact email', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-001',
          email: 'newemail@example.com',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.contact.email).toBe('newemail@example.com');
      expect(result.data.updated_fields).toContain('email');
    });

    it('should update multiple fields at once', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-001',
          name: 'Updated Name',
          email: 'updated@example.com',
          is_customer: false,
          is_supplier: true,
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.contact.name).toBe('Updated Name');
      expect(result.data.contact.email).toBe('updated@example.com');
      expect(result.data.contact.is_customer).toBe(false);
      expect(result.data.contact.is_supplier).toBe(true);
      expect(result.data.updated_fields.length).toBe(4);
    });

    it('should archive a contact', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-002',
          status: 'ARCHIVED',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.contact.status).toBe('ARCHIVED');
      expect(result.data.updated_fields).toContain('status');
    });

    it('should reactivate an archived contact', async () => {
      // First archive the contact
      await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-002',
          status: 'ARCHIVED',
          verbosity: 'diagnostic',
        },
        adapter
      );

      // Then reactivate
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-002',
          status: 'ACTIVE',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(true);
      expect(result.data.contact.status).toBe('ACTIVE');
    });
  });

  describe('error handling', () => {
    it('should fail for non-existent contact', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'non-existent-contact',
          name: 'New Name',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.diagnostics?.narrative).toContain('not found');
      expect(result.recovery?.next_tool_call?.name).toBe('list_contacts');
    });

    it('should fail for non-existent tenant', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: 'non-existent-tenant',
          contact_id: 'contact-001',
          name: 'New Name',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.success).toBe(false);
    });
  });

  describe('idempotency and persistence', () => {
    it('should persist changes across operations', async () => {
      // First update
      const result1 = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-001',
          name: 'Persistent Name',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result1.data.contact.name).toBe('Persistent Name');

      // Get the contact to verify persistence
      const contacts = await adapter.getContacts(tenantId);
      const contact = contacts.find(c => c.contact_id === 'contact-001');
      expect(contact?.name).toBe('Persistent Name');
    });
  });

  describe('verbosity levels', () => {
    it('should include narrative in diagnostic mode', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-001',
          name: 'Test Update',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.diagnostics?.narrative).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('Updated contact');
    });

    it('should include updated fields list in response', async () => {
      const result = await handleUpdateContact(
        {
          tenant_id: tenantId,
          contact_id: 'contact-001',
          name: 'New Name',
          email: 'new@example.com',
          verbosity: 'diagnostic',
        },
        adapter
      );

      expect(result.data.updated_fields).toEqual(['name', 'email']);
    });
  });
});
