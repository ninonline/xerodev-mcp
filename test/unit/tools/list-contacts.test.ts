import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { handleListContacts, type ListContactsArgs } from '../../../src/tools/crud/list-contacts.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';
import { clearSimulation, handleSimulateNetwork } from '../../../src/tools/chaos/simulate-network.js';

describe('list_contacts', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(() => {
    clearSimulation(tenantId);
  });

  const validArgs: ListContactsArgs = {
    tenant_id: tenantId,
    verbosity: 'diagnostic',
  };

  // ============================================
  // Basic Functionality Tests
  // ============================================
  describe('basic functionality', () => {
    it('should list contacts without filters', async () => {
      const result = await handleListContacts(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).contacts).toBeDefined();
      expect(Array.isArray((result.data as any).contacts)).toBe(true);
      expect((result.data as any).total_count).toBeGreaterThan(0);
    });

    it('should return pagination information', async () => {
      const result = await handleListContacts(validArgs, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).page).toBe(1);
      expect((result.data as any).page_size).toBe(20);
      expect((result.data as any).total_pages).toBeGreaterThanOrEqual(1);
      expect((result.data as any).total_count).toBeGreaterThan(0);
    });

    it('should return contacts with expected fields', async () => {
      const result = await handleListContacts(validArgs, adapter);

      expect(result.success).toBe(true);
      const contacts = (result.data as any).contacts;
      if (contacts.length > 0) {
        const contact = contacts[0];
        expect(contact.contact_id).toBeDefined();
        expect(contact.name).toBeDefined();
        expect(contact.status).toBeDefined();
        expect(typeof contact.is_customer).toBe('boolean');
        expect(typeof contact.is_supplier).toBe('boolean');
      }
    });

    it('should include meta and diagnostics', async () => {
      const result = await handleListContacts(validArgs, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('contact');
    });
  });

  // ============================================
  // Filter Tests
  // ============================================
  describe('filtering', () => {
    it('should filter by status ACTIVE', async () => {
      const result = await handleListContacts({
        ...validArgs,
        status: 'ACTIVE',
      }, adapter);

      expect(result.success).toBe(true);
      const contacts = (result.data as any).contacts;
      contacts.forEach((c: any) => {
        expect(c.status).toBe('ACTIVE');
      });
      expect((result.data as any).filters_applied).toContain('status=ACTIVE');
    });

    it('should filter by is_customer', async () => {
      const result = await handleListContacts({
        ...validArgs,
        is_customer: true,
      }, adapter);

      expect(result.success).toBe(true);
      const contacts = (result.data as any).contacts;
      contacts.forEach((c: any) => {
        expect(c.is_customer).toBe(true);
      });
      expect((result.data as any).filters_applied).toContain('is_customer=true');
    });

    it('should filter by is_supplier', async () => {
      const result = await handleListContacts({
        ...validArgs,
        is_supplier: true,
      }, adapter);

      expect(result.success).toBe(true);
      const contacts = (result.data as any).contacts;
      contacts.forEach((c: any) => {
        expect(c.is_supplier).toBe(true);
      });
      expect((result.data as any).filters_applied).toContain('is_supplier=true');
    });

    it('should search by name', async () => {
      // First get all contacts to find a valid name
      const allResult = await handleListContacts(validArgs, adapter);
      const firstContact = (allResult.data as any).contacts[0];
      const searchTerm = firstContact.name.substring(0, 5);

      const result = await handleListContacts({
        ...validArgs,
        search: searchTerm,
      }, adapter);

      expect(result.success).toBe(true);
      const contacts = (result.data as any).contacts;
      contacts.forEach((c: any) => {
        const matchesName = c.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesEmail = c.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFirstName = c.first_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLastName = c.last_name?.toLowerCase().includes(searchTerm.toLowerCase());
        expect(matchesName || matchesEmail || matchesFirstName || matchesLastName).toBe(true);
      });
    });

    it('should handle combined filters', async () => {
      const result = await handleListContacts({
        ...validArgs,
        status: 'ACTIVE',
        is_customer: true,
      }, adapter);

      expect(result.success).toBe(true);
      const contacts = (result.data as any).contacts;
      contacts.forEach((c: any) => {
        expect(c.status).toBe('ACTIVE');
        expect(c.is_customer).toBe(true);
      });
    });

    it('should return empty array for search with no matches', async () => {
      const result = await handleListContacts({
        ...validArgs,
        search: 'xyznonexistentcontact123',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).contacts).toHaveLength(0);
      expect((result.data as any).total_count).toBe(0);
    });
  });

  // ============================================
  // Pagination Tests
  // ============================================
  describe('pagination', () => {
    it('should respect page_size parameter', async () => {
      const result = await handleListContacts({
        ...validArgs,
        page_size: 5,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).contacts.length).toBeLessThanOrEqual(5);
      expect((result.data as any).page_size).toBe(5);
    });

    it('should return correct page', async () => {
      const result = await handleListContacts({
        ...validArgs,
        page: 2,
        page_size: 5,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).page).toBe(2);
    });

    it('should return empty array for page beyond results', async () => {
      const result = await handleListContacts({
        ...validArgs,
        page: 1000,
        page_size: 20,
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).contacts).toHaveLength(0);
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('error handling', () => {
    it('should fail for non-existent tenant', async () => {
      const result = await handleListContacts({
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

      const result = await handleListContacts(validArgs, adapter);

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

      const result = await handleListContacts(validArgs, adapter);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Verbosity Level Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should exclude diagnostics for silent verbosity', async () => {
      const result = await handleListContacts({
        ...validArgs,
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });

    it('should include meta for compact verbosity', async () => {
      const result = await handleListContacts({
        ...validArgs,
        verbosity: 'compact',
      }, adapter);

      expect(result.meta).toBeDefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
