/**
 * Integration Test: AI Agent Workflow
 *
 * This test simulates a complete AI agent workflow using the xerodev-mcp server.
 * It follows the recommended workflow from get_mcp_capabilities and demonstrates
 * the recovery flow when validation fails.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { XeroMockAdapter } from '../../src/adapters/xero-mock-adapter.js';
import { handleGetCapabilities } from '../../src/tools/core/get-capabilities.js';
import { handleSwitchTenant } from '../../src/tools/core/switch-tenant.js';
import { handleValidateSchema } from '../../src/tools/validation/validate-schema.js';
import { handleIntrospectEnums } from '../../src/tools/validation/introspect-enums.js';
import { handleDryRunSync } from '../../src/tools/simulation/dry-run-sync.js';
import { handleSeedSandbox } from '../../src/tools/simulation/seed-sandbox.js';

describe('AI Agent Workflow', () => {
  let adapter: XeroMockAdapter;

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  describe('Happy Path: Valid Invoice Creation', () => {
    it('should complete full workflow for valid invoice', async () => {
      // Step 1: Get capabilities
      const caps = await handleGetCapabilities(
        { include_tenants: true, verbosity: 'diagnostic' },
        adapter
      );
      expect(caps.success).toBe(true);
      expect(caps.data.available_tenants?.length).toBeGreaterThan(0);
      expect(caps.data.guidelines.workflow.length).toBeGreaterThan(0);

      const tenantId = caps.data.available_tenants![0].tenant_id;

      // Step 2: Switch to tenant
      const tenant = await handleSwitchTenant(
        { tenant_id: tenantId, verbosity: 'diagnostic' },
        adapter
      );
      expect(tenant.success).toBe(true);
      expect(tenant.data.accounts_count).toBeGreaterThan(0);

      // Step 3: Get valid account codes
      const accounts = await handleIntrospectEnums(
        {
          tenant_id: tenantId,
          entity_type: 'Account',
          filter: { type: 'REVENUE', status: 'ACTIVE' },
          verbosity: 'compact',
        },
        adapter
      );
      expect(accounts.success).toBe(true);
      const validAccountCode = (accounts.data.values[0] as any).code;

      // Step 4: Get valid contacts
      const contacts = await handleIntrospectEnums(
        {
          tenant_id: tenantId,
          entity_type: 'Contact',
          filter: { is_customer: true },
          verbosity: 'compact',
        },
        adapter
      );
      expect(contacts.success).toBe(true);
      const validContactId = (contacts.data.values[0] as any).contact_id;

      // Step 5: Validate invoice payload
      const invoice = {
        type: 'ACCREC',
        contact: { contact_id: validContactId },
        line_items: [{
          description: 'Consulting Services',
          quantity: 10,
          unit_amount: 150.00,
          account_code: validAccountCode,
          tax_type: 'OUTPUT',
        }],
      };

      const validation = await handleValidateSchema(
        {
          tenant_id: tenantId,
          entity_type: 'Invoice',
          payload: invoice,
          verbosity: 'diagnostic',
        },
        adapter
      );
      expect(validation.success).toBe(true);
      expect(validation.data.valid).toBe(true);
      expect(validation.data.score).toBe(1.0);

      // Step 6: Dry run the batch
      const dryRun = await handleDryRunSync(
        {
          tenant_id: tenantId,
          operation: 'create_invoices',
          payloads: [invoice],
          verbosity: 'diagnostic',
        },
        adapter
      );
      expect(dryRun.success).toBe(true);
      expect(dryRun.data.would_succeed).toBe(1);
      expect(dryRun.data.would_fail).toBe(0);
    });
  });

  describe('Recovery Path: Invalid Invoice with Fix', () => {
    it('should guide AI through recovery when validation fails', async () => {
      const tenantId = 'acme-au-001';

      // Step 1: Submit invalid invoice
      const badInvoice = {
        type: 'ACCREC',
        contact: { contact_id: 'non-existent-contact' },
        line_items: [{
          description: 'Test Service',
          quantity: 1,
          unit_amount: 100,
          account_code: 'INVALID_CODE',
          tax_type: 'WRONG_TAX',
        }],
      };

      const validation1 = await handleValidateSchema(
        {
          tenant_id: tenantId,
          entity_type: 'Invoice',
          payload: badInvoice,
          verbosity: 'diagnostic',
        },
        adapter
      );
      expect(validation1.success).toBe(false);
      expect(validation1.data.valid).toBe(false);
      expect(validation1.recovery).toBeDefined();
      expect(validation1.recovery?.next_tool_call).toBeDefined();

      // Step 2: Follow recovery suggestion - get valid accounts
      const recoveryCall = validation1.recovery!.next_tool_call!;
      expect(recoveryCall.name).toBe('introspect_enums');

      const enumResult = await handleIntrospectEnums(
        {
          tenant_id: recoveryCall.arguments.tenant_id,
          entity_type: recoveryCall.arguments.entity_type,
          filter: recoveryCall.arguments.filter,
          verbosity: 'compact',
        },
        adapter
      );
      expect(enumResult.success).toBe(true);
      expect(enumResult.data.values.length).toBeGreaterThan(0);

      // Step 3: Get valid contact
      const contacts = await handleIntrospectEnums(
        {
          tenant_id: tenantId,
          entity_type: 'Contact',
          filter: { is_customer: true },
          verbosity: 'compact',
        },
        adapter
      );
      const validContactId = (contacts.data.values[0] as any).contact_id;

      // Step 4: Get valid tax rates
      const taxRates = await handleIntrospectEnums(
        {
          tenant_id: tenantId,
          entity_type: 'TaxRate',
          verbosity: 'compact',
        },
        adapter
      );
      const validTaxType = (taxRates.data.values[0] as any).tax_type;

      // Step 5: Fix the invoice with valid values
      const fixedInvoice = {
        type: 'ACCREC',
        contact: { contact_id: validContactId },
        line_items: [{
          description: 'Test Service',
          quantity: 1,
          unit_amount: 100,
          account_code: (enumResult.data.values[0] as any).code,
          tax_type: validTaxType,
        }],
      };

      // Step 6: Validate again - should pass
      const validation2 = await handleValidateSchema(
        {
          tenant_id: tenantId,
          entity_type: 'Invoice',
          payload: fixedInvoice,
          verbosity: 'diagnostic',
        },
        adapter
      );
      expect(validation2.success).toBe(true);
      expect(validation2.data.valid).toBe(true);
    });
  });

  describe('Batch Processing Workflow', () => {
    it('should handle batch invoice processing with mixed results', async () => {
      const tenantId = 'acme-au-001';

      // Step 1: Generate test data
      const generated = await handleSeedSandbox(
        {
          tenant_id: tenantId,
          entity: 'INVOICES',
          count: 5,
          scenario: 'DEFAULT',
          verbosity: 'debug',
        },
        adapter
      );
      expect(generated.success).toBe(true);
      expect(generated.data.count).toBe(5);

      // Step 2: Dry run the batch
      const dryRun = await handleDryRunSync(
        {
          tenant_id: tenantId,
          operation: 'create_invoices',
          payloads: generated.data.generated,
          verbosity: 'diagnostic',
        },
        adapter
      );
      expect(dryRun.data.total_payloads).toBe(5);
      expect(dryRun.data.estimated_total_amount).toBeGreaterThan(0);
    });
  });

  describe('Error Scenario: Non-existent Tenant', () => {
    it('should handle tenant not found gracefully', async () => {
      const result = await handleSwitchTenant(
        { tenant_id: 'non-existent', verbosity: 'diagnostic' },
        adapter
      );

      expect(result.success).toBe(false);
      expect(result.recovery).toBeDefined();
      expect(result.recovery?.next_tool_call?.name).toBe('get_mcp_capabilities');
    });
  });

  describe('Scenario: Overdue Bills Analysis', () => {
    it('should generate and validate overdue invoices', async () => {
      const tenantId = 'acme-au-001';

      // Generate overdue invoices
      const overdue = await handleSeedSandbox(
        {
          tenant_id: tenantId,
          entity: 'INVOICES',
          count: 10,
          scenario: 'OVERDUE_BILLS',
          verbosity: 'debug',
        },
        adapter
      );
      expect(overdue.success).toBe(true);

      // Verify they have AUTHORISED status and past due dates
      const invoices = overdue.data.generated as any[];
      invoices.forEach(inv => {
        expect(inv.status).toBe('AUTHORISED');
        const dueDate = new Date(inv.due_date);
        expect(dueDate.getTime()).toBeLessThan(Date.now());
      });

      // Dry run should pass for well-formed invoices
      const dryRun = await handleDryRunSync(
        {
          tenant_id: tenantId,
          operation: 'create_invoices',
          payloads: invoices,
          verbosity: 'diagnostic',
        },
        adapter
      );
      expect(dryRun.data.success_rate).toBeGreaterThan(0.8);
    });
  });
});
