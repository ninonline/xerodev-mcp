import { z } from 'zod';
import type { XeroAdapter, ValidationDiff, Invoice, Quote, CreditNote, Payment, BankTransaction } from '../../adapters/adapter-interface.js';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel, type RecoveryAction } from '../../core/mcp-response.js';

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_amount: z.number(),
  account_code: z.string(),
  tax_type: z.string().optional(),
});

const InvoicePayloadSchema = z.object({
  type: z.enum(['ACCREC', 'ACCPAY']).optional(),
  contact_id: z.string().describe('Contact ID for the invoice'),
  date: z.string().optional(),
  due_date: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED']).optional(),
  line_items: z.array(LineItemSchema).min(1),
});

const QuotePayloadSchema = z.object({
  contact_id: z.string().describe('Contact ID for the quote recipient'),
  date: z.string().optional(),
  expiry_date: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'INVOICED']).optional(),
  line_items: z.array(LineItemSchema).min(1),
  title: z.string().optional(),
  summary: z.string().optional(),
  terms: z.string().optional(),
  reference: z.string().optional(),
});

const CreditNotePayloadSchema = z.object({
  type: z.enum(['ACCRECCREDIT', 'ACCPAYCREDIT']).optional(),
  contact_id: z.string().describe('Contact ID for the credit note'),
  date: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED']).optional(),
  line_items: z.array(LineItemSchema).min(1),
  reference: z.string().optional(),
});

const PaymentPayloadSchema = z.object({
  invoice_id: z.string().optional().describe('Invoice ID to apply payment to'),
  credit_note_id: z.string().optional().describe('Credit note ID to refund'),
  account_id: z.string().describe('Bank account ID for the payment'),
  date: z.string().optional(),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

const BankTransactionPayloadSchema = z.object({
  type: z.enum(['RECEIVE', 'SPEND', 'RECEIVE-OVERPAYMENT', 'RECEIVE-PREPAYMENT', 'SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT']),
  contact_id: z.string().optional().describe('Contact ID (optional for some transaction types)'),
  bank_account_id: z.string().describe('Bank account ID'),
  date: z.string().optional(),
  line_items: z.array(LineItemSchema).min(1),
  reference: z.string().optional(),
});

export const ValidateSchemaSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  entity_type: z.enum(['Invoice', 'Contact', 'Quote', 'CreditNote', 'Payment', 'BankTransaction']).describe('Type of entity to validate'),
  payload: z.any().describe('The payload to validate'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type ValidateSchemaArgs = z.infer<typeof ValidateSchemaSchema>;

export const VALIDATE_SCHEMA_TOOL = {
  name: 'validate_schema_match',
  description: `Validates a payload against Xero's schema AND the tenant's specific configuration.

**This is the most important tool.** Call it before any write operation.

Returns:
- Structural validation (JSON schema compliance)
- Context validation (AccountCodes exist, TaxTypes valid for region)
- Compliance score (0.0 to 1.0)
- Detailed diff showing what's wrong
- Recovery suggestions with next_tool_call
- Warnings about API behavior differences (e.g., readonly fields)

**IMPORTANT - Invoice Type Field:**
When validating invoices with type="ACCREC" or type="ACCPAY":
- **Live mode**: This warning appears because Type is readonly in Xero API
- Xero automatically determines Type from the contact's role
- No action needed - validation passes with this warning

Example flow:
1. Developer submits invoice payload
2. This tool finds AccountCode '999' is ARCHIVED
3. Returns recovery.next_tool_call pointing to introspect_enums
4. AI agent calls introspect_enums to find valid codes
5. AI agent fixes the payload and validates again`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Target tenant ID',
      },
      entity_type: {
        type: 'string',
        enum: ['Invoice', 'Contact', 'Quote', 'CreditNote', 'Payment', 'BankTransaction'],
        description: 'Type of entity to validate',
      },
      payload: {
        type: 'object',
        description: 'The payload to validate',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'entity_type', 'payload'],
  },
};

interface ValidationData {
  valid: boolean;
  entity_type: string;
  score: number;
  diff?: ValidationDiff[];
  errors?: string[];
  warnings?: string[];
}

export async function handleValidateSchema(
  args: ValidateSchemaArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<ValidationData>> {
  const startTime = Date.now();
  const { tenant_id, entity_type, payload, verbosity } = args;

  try {
    let result;

    // Helper function to handle structural validation
    const validateStructure = <T>(schema: z.ZodType<T>, typeName: string) => {
      const parseResult = schema.safeParse(payload);
      if (!parseResult.success) {
        const structureErrors = parseResult.error.errors.map(
          e => `${e.path.join('.')}: ${e.message}`
        );

        const structResponse = createResponse({
          success: false,
          data: {
            valid: false,
            entity_type,
            score: 0,
            errors: structureErrors,
            diff: parseResult.error.errors.map(e => ({
              field: e.path.join('.'),
              issue: e.message,
              severity: 'error' as const,
            })),
          },
          verbosity: verbosity as VerbosityLevel,
          executionTimeMs: Date.now() - startTime,
          narrative: `${typeName} structure is invalid. ${structureErrors.length} structural error(s) found.`,
          recovery: {
            suggested_action_id: 'fix_structure',
            description: 'Fix the structural issues in the payload',
          },
        });
        auditLogResponse(structResponse, 'validate_schema_match', tenant_id, Date.now() - startTime);
        return {
          isValid: false,
          response: structResponse,
        };
      }
      return { isValid: true, data: parseResult.data };
    };

    if (entity_type === 'Invoice') {
      const validation = validateStructure(InvoicePayloadSchema, 'Invoice');
      if (!validation.isValid) return validation.response!;
      // Transform flat structure to nested structure for adapter
      const data = validation.data as z.infer<typeof InvoicePayloadSchema>;
      const adapterPayload: Partial<Invoice> = {
        type: data.type,
        contact: { contact_id: data.contact_id },
        date: data.date,
        due_date: data.due_date,
        reference: data.reference,
        status: data.status,
        line_items: data.line_items,
      };
      result = await adapter.validateInvoice(tenant_id, adapterPayload);
    } else if (entity_type === 'Contact') {
      result = await adapter.validateContact(tenant_id, payload);
    } else if (entity_type === 'Quote') {
      const validation = validateStructure(QuotePayloadSchema, 'Quote');
      if (!validation.isValid) return validation.response!;
      // Transform flat structure to nested structure for adapter
      const data = validation.data as z.infer<typeof QuotePayloadSchema>;
      const adapterPayload: Partial<Quote> = {
        contact: { contact_id: data.contact_id },
        date: data.date,
        expiry_date: data.expiry_date,
        status: data.status,
        line_items: data.line_items,
        title: data.title,
        summary: data.summary,
        terms: data.terms,
      };
      result = await adapter.validateQuote(tenant_id, adapterPayload);
    } else if (entity_type === 'CreditNote') {
      const validation = validateStructure(CreditNotePayloadSchema, 'CreditNote');
      if (!validation.isValid) return validation.response!;
      // Transform flat structure to nested structure for adapter
      const data = validation.data as z.infer<typeof CreditNotePayloadSchema>;
      const adapterPayload: Partial<CreditNote> = {
        type: data.type,
        contact: { contact_id: data.contact_id },
        date: data.date,
        status: data.status,
        line_items: data.line_items,
        reference: data.reference,
      };
      result = await adapter.validateCreditNote(tenant_id, adapterPayload);
    } else if (entity_type === 'Payment') {
      const validation = validateStructure(PaymentPayloadSchema, 'Payment');
      if (!validation.isValid) return validation.response!;
      // Transform flat structure to nested structure for adapter
      const data = validation.data as z.infer<typeof PaymentPayloadSchema>;
      const adapterPayload: Partial<Payment> = {
        invoice: data.invoice_id ? { invoice_id: data.invoice_id } : undefined,
        credit_note: data.credit_note_id ? { credit_note_id: data.credit_note_id } : undefined,
        account: { account_id: data.account_id },
        date: data.date,
        amount: data.amount,
        reference: data.reference,
      };
      result = await adapter.validatePayment(tenant_id, adapterPayload);
    } else if (entity_type === 'BankTransaction') {
      const validation = validateStructure(BankTransactionPayloadSchema, 'BankTransaction');
      if (!validation.isValid) return validation.response!;
      // Transform flat structure to nested structure for adapter
      const data = validation.data as z.infer<typeof BankTransactionPayloadSchema>;
      const adapterPayload: Partial<BankTransaction> = {
        type: data.type,
        contact: data.contact_id ? { contact_id: data.contact_id } : undefined,
        bank_account: { account_id: data.bank_account_id },
        date: data.date,
        line_items: data.line_items,
        reference: data.reference,
      };
      result = await adapter.validateBankTransaction(tenant_id, adapterPayload);
    } else {
      throw new Error(`Unsupported entity type: ${entity_type}`);
    }

    const executionTimeMs = Date.now() - startTime;

    if (result.valid) {
      // Add warning about Type field for Invoices in live mode
      const warnings = result.warnings ? [...result.warnings] : [];
      if (entity_type === 'Invoice' && payload.type) {
        warnings.push(
          'The "type" field (ACCREC/ACCPAY) is ignored in live Xero API. ' +
          'Xero automatically determines the invoice type from the contact: ' +
          'customers (is_customer=true) create ACCREC, suppliers (is_supplier=true) create ACCPAY.'
        );
      }

      const validResponse = createResponse({
        success: true,
        data: {
          valid: true,
          entity_type,
          score: result.score,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
        verbosity: verbosity as VerbosityLevel,
        score: result.score,
        executionTimeMs,
        narrative: `${entity_type} payload is valid for tenant ${tenant_id}. Score: ${result.score.toFixed(2)}. Safe to proceed.`,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
      auditLogResponse(validResponse, 'validate_schema_match', tenant_id, executionTimeMs);
      return validResponse;
    }

    // Validation failed - determine recovery action
    let recovery: RecoveryAction | undefined;

    if (result.errors.some(e => e.toLowerCase().includes('account'))) {
      recovery = {
        suggested_action_id: 'find_valid_account_codes',
        description: 'Search for valid account codes in the tenant Chart of Accounts',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: {
            tenant_id,
            entity_type: 'Account',
            filter: { status: 'ACTIVE' },
          },
        },
      };
    } else if (result.errors.some(e => e.toLowerCase().includes('tax'))) {
      recovery = {
        suggested_action_id: 'find_valid_tax_types',
        description: 'Get valid tax types for this tenant region',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: {
            tenant_id,
            entity_type: 'TaxRate',
          },
        },
      };
    } else if (result.errors.some(e => e.toLowerCase().includes('contact'))) {
      recovery = {
        suggested_action_id: 'find_or_create_contact',
        description: 'Search for existing contacts or verify contact ID',
        next_tool_call: {
          name: 'introspect_enums',
          arguments: {
            tenant_id,
            entity_type: 'Contact',
            filter: { status: 'ACTIVE' },
          },
        },
      };
    }

    const failedResponse = createResponse({
      success: false,
      data: {
        valid: false,
        entity_type,
        score: result.score,
        diff: result.diff,
        errors: result.errors,
        warnings: result.warnings,
      },
      verbosity: verbosity as VerbosityLevel,
      score: result.score,
      executionTimeMs,
      narrative: `${entity_type} validation failed with ${result.errors.length} error(s). ` +
        `Most common issue: ${result.errors[0]}. ` +
        `See recovery.next_tool_call for suggested fix.`,
      warnings: result.warnings,
      recovery,
    });
    auditLogResponse(failedResponse, 'validate_schema_match', tenant_id, executionTimeMs);
    return failedResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorResponse = createResponse({
      success: false,
      data: {
        valid: false,
        entity_type,
        score: 0,
        errors: [message],
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Validation failed with error: ${message}`,
      rootCause: message,
    });
    auditLogResponse(errorResponse, 'validate_schema_match', tenant_id ?? null, Date.now() - startTime);
    return errorResponse;
  }
}
