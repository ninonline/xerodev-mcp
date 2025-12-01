import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { handleDriveLifecycle, type DriveLifecycleArgs } from '../../../src/tools/simulation/drive-lifecycle.js';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter.js';

describe('drive_lifecycle', () => {
  let adapter: XeroMockAdapter;
  const tenantId = 'acme-au-001';
  const validBankAccountId = 'acc-027';

  beforeAll(() => {
    adapter = new XeroMockAdapter();
  });

  beforeEach(async () => {
    // Reset adapter to ensure clean state
    adapter = new XeroMockAdapter();
  });

  // ============================================
  // Invoice Lifecycle Tests
  // ============================================
  describe('invoice lifecycle', () => {
    it('should transition invoice from DRAFT to AUTHORISED', async () => {
      // First create an invoice
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        date: '2025-01-01',
        due_date: '2025-02-01',
        status: 'DRAFT',
        line_amount_types: 'Exclusive',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
        currency_code: 'AUD',
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'AUTHORISED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).previous_state).toBe('DRAFT');
      expect((result.data as any).new_state).toBe('AUTHORISED');
    });

    it('should transition invoice from DRAFT to SUBMITTED to AUTHORISED', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'SUBMITTED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('SUBMITTED');

      // Now transition to AUTHORISED
      const result2 = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'AUTHORISED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result2.success).toBe(true);
      expect((result2.data as any).new_state).toBe('AUTHORISED');
    });

    it('should transition invoice to PAID with payment details', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'AUTHORISED',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
        total: 110,
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'PAID',
        payment_amount: 110,
        payment_account_id: validBankAccountId,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('PAID');
      expect((result.data as any).payment_created).toBeDefined();
      expect((result.data as any).payment_created.amount).toBe(110);
    });

    it('should transition invoice to VOIDED from DRAFT', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'VOIDED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('VOIDED');
    });

    it('should fail to transition PAID invoice (terminal state)', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'PAID',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'DRAFT',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('Cannot transition');
    });

    it('should fail to transition VOIDED invoice (terminal state)', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'VOIDED',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'DRAFT',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('Cannot transition');
    });
  });

  // ============================================
  // Quote Lifecycle Tests
  // ============================================
  describe('quote lifecycle', () => {
    it('should transition quote from DRAFT to SENT', async () => {
      const quote = await adapter.createQuote(tenantId, {
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Quote',
        entity_id: quote.quote_id,
        target_state: 'SENT',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('SENT');
    });

    it('should transition quote from SENT to ACCEPTED', async () => {
      const quote = await adapter.createQuote(tenantId, {
        contact: { contact_id: 'contact-001' },
        status: 'SENT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Quote',
        entity_id: quote.quote_id,
        target_state: 'ACCEPTED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('ACCEPTED');
    });

    it('should transition quote from ACCEPTED to INVOICED and create invoice', async () => {
      const quote = await adapter.createQuote(tenantId, {
        contact: { contact_id: 'contact-001' },
        status: 'ACCEPTED',
        line_amount_types: 'Exclusive',
        line_items: [{ description: 'Consulting', quantity: 10, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
        currency_code: 'AUD',
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Quote',
        entity_id: quote.quote_id,
        target_state: 'INVOICED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('INVOICED');
      expect((result.data as any).invoice_created).toBeDefined();
      expect((result.data as any).invoice_created.from_quote).toBe(quote.quote_id);
    });

    it('should transition quote to DECLINED', async () => {
      const quote = await adapter.createQuote(tenantId, {
        contact: { contact_id: 'contact-001' },
        status: 'SENT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Quote',
        entity_id: quote.quote_id,
        target_state: 'DECLINED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('DECLINED');
    });

    it('should allow DECLINED quote to return to DRAFT', async () => {
      const quote = await adapter.createQuote(tenantId, {
        contact: { contact_id: 'contact-001' },
        status: 'DECLINED',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Quote',
        entity_id: quote.quote_id,
        target_state: 'DRAFT',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('DRAFT');
    });

    it('should fail to transition INVOICED quote (terminal state)', async () => {
      const quote = await adapter.createQuote(tenantId, {
        contact: { contact_id: 'contact-001' },
        status: 'INVOICED',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Quote',
        entity_id: quote.quote_id,
        target_state: 'DRAFT',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Credit Note Lifecycle Tests
  // ============================================
  describe('credit note lifecycle', () => {
    it('should transition credit note from DRAFT to AUTHORISED', async () => {
      const creditNote = await adapter.createCreditNote(tenantId, {
        type: 'ACCRECCREDIT',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Refund', quantity: 1, unit_amount: 50, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'CreditNote',
        entity_id: creditNote.credit_note_id,
        target_state: 'AUTHORISED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('AUTHORISED');
    });

    it('should transition credit note to PAID with payment', async () => {
      const creditNote = await adapter.createCreditNote(tenantId, {
        type: 'ACCRECCREDIT',
        contact: { contact_id: 'contact-001' },
        status: 'AUTHORISED',
        line_items: [{ description: 'Refund', quantity: 1, unit_amount: 50, account_code: '200', tax_type: 'OUTPUT' }],
        total: 55,
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'CreditNote',
        entity_id: creditNote.credit_note_id,
        target_state: 'PAID',
        payment_amount: 55,
        payment_account_id: validBankAccountId,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('PAID');
      expect((result.data as any).payment_created).toBeDefined();
    });

    it('should transition credit note to VOIDED', async () => {
      const creditNote = await adapter.createCreditNote(tenantId, {
        type: 'ACCRECCREDIT',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Refund', quantity: 1, unit_amount: 50, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'CreditNote',
        entity_id: creditNote.credit_note_id,
        target_state: 'VOIDED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).new_state).toBe('VOIDED');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('validation', () => {
    it('should fail for non-existent entity', async () => {
      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: 'non-existent-invoice',
        target_state: 'AUTHORISED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('not found');
    });

    it('should fail for invalid target state', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'INVALID_STATE',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('Invalid target state');
    });

    it('should require payment_amount for PAID transition', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'AUTHORISED',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'PAID',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('payment_amount');
    });

    it('should require payment_account_id for PAID transition', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'AUTHORISED',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'PAID',
        payment_amount: 100,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(false);
      expect((result.data as any).error).toContain('payment_account_id');
    });
  });

  // ============================================
  // Same State Tests
  // ============================================
  describe('same state handling', () => {
    it('should succeed when already in target state', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'DRAFT',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).previous_state).toBe('DRAFT');
      expect((result.data as any).new_state).toBe('DRAFT');
      expect(result.diagnostics?.narrative).toContain('already in state');
    });
  });

  // ============================================
  // Transition Path Tests
  // ============================================
  describe('transition paths', () => {
    it('should find multi-step path for invoice DRAFT to PAID', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
        total: 110,
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'PAID',
        payment_amount: 110,
        payment_account_id: validBankAccountId,
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      expect((result.data as any).transition_path.length).toBeGreaterThan(2);
      expect((result.data as any).transition_path[0]).toBe('DRAFT');
      expect((result.data as any).transition_path[(result.data as any).transition_path.length - 1]).toBe('PAID');
    });

    it('should find shortest path for quote DRAFT to ACCEPTED', async () => {
      const quote = await adapter.createQuote(tenantId, {
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Quote',
        entity_id: quote.quote_id,
        target_state: 'ACCEPTED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.success).toBe(true);
      // DRAFT -> SENT -> ACCEPTED
      expect((result.data as any).transition_path).toEqual(['DRAFT', 'SENT', 'ACCEPTED']);
    });
  });

  // ============================================
  // Verbosity Tests
  // ============================================
  describe('verbosity levels', () => {
    it('should include diagnostics for diagnostic verbosity', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'AUTHORISED',
        verbosity: 'diagnostic',
      }, adapter);

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('transitioned');
    });

    it('should exclude diagnostics for silent verbosity', async () => {
      const invoice = await adapter.createInvoice(tenantId, {
        type: 'ACCREC',
        contact: { contact_id: 'contact-001' },
        status: 'DRAFT',
        line_items: [{ description: 'Test', quantity: 1, unit_amount: 100, account_code: '200', tax_type: 'OUTPUT' }],
      });

      const result = await handleDriveLifecycle({
        tenant_id: tenantId,
        entity_type: 'Invoice',
        entity_id: invoice.invoice_id,
        target_state: 'AUTHORISED',
        verbosity: 'silent',
      }, adapter);

      expect(result.success).toBe(true);
      expect(result.meta).toBeUndefined();
      expect(result.diagnostics).toBeUndefined();
    });
  });
});
