import { z } from 'zod';
import type { XeroAdapter, Invoice, ValidationResult } from '../../adapters/adapter-interface.js';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_amount: z.number(),
  account_code: z.string(),
  tax_type: z.string().optional(),
});

const InvoicePayloadSchema = z.object({
  type: z.enum(['ACCREC', 'ACCPAY']).optional(),
  contact_id: z.string(),
  date: z.string().optional(),
  due_date: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED']).optional(),
  line_amount_types: z.enum(['Exclusive', 'Inclusive', 'NoTax']).optional(),
  line_items: z.array(LineItemSchema).min(1),
  currency_code: z.string().optional(),
});

export const DryRunSyncSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  operation: z.enum(['create_invoices', 'create_contacts']).describe('Type of batch operation'),
  payloads: z.array(z.any()).min(1).max(50).describe('Array of payloads to simulate (max 50)'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type DryRunSyncArgs = z.infer<typeof DryRunSyncSchema>;

export const DRY_RUN_SYNC_TOOL = {
  name: 'dry_run_sync',
  description: `Simulates a batch operation without actually executing it.

Use this to:
- Test batch invoice creation before running for real
- Identify which payloads in a batch would fail
- Get estimated totals and counts
- Understand the impact of a batch operation

Returns:
- Summary of what would happen
- Individual validation results for each payload
- Aggregated statistics (total amount, success rate, etc.)
- List of issues to fix before running for real

This tool does NOT modify any data. It's safe to call repeatedly.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Target tenant ID',
      },
      operation: {
        type: 'string',
        enum: ['create_invoices', 'create_contacts'],
        description: 'Type of batch operation',
      },
      payloads: {
        type: 'array',
        description: 'Array of payloads to simulate (max 50)',
        items: { type: 'object' },
        maxItems: 50,
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'operation', 'payloads'],
  },
};

interface PayloadResult {
  index: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimated_total?: number;
}

interface DryRunData {
  operation: string;
  total_payloads: number;
  would_succeed: number;
  would_fail: number;
  success_rate: number;
  estimated_total_amount?: number;
  results: PayloadResult[];
  issues_summary: string[];
}

export async function handleDryRunSync(
  args: DryRunSyncArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<DryRunData>> {
  const startTime = Date.now();
  const { tenant_id, operation, payloads, verbosity } = args;

  const results: PayloadResult[] = [];
  let wouldSucceed = 0;
  let wouldFail = 0;
  let estimatedTotalAmount = 0;
  const issuesSummary: Map<string, number> = new Map();

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    let validationResult: ValidationResult;
    let estimatedTotal: number | undefined;

    if (operation === 'create_invoices') {
      // Validate invoice structure first
      const parseResult = InvoicePayloadSchema.safeParse(payload);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        results.push({
          index: i,
          valid: false,
          errors,
          warnings: [],
        });
        wouldFail++;
        errors.forEach(err => {
          const key = err.split(':')[0];
          issuesSummary.set(key, (issuesSummary.get(key) ?? 0) + 1);
        });
        continue;
      }

      // Transform flat structure to nested structure for adapter
      const data = parseResult.data;
      const adapterPayload: Partial<Invoice> = {
        type: data.type,
        contact: { contact_id: data.contact_id },
        date: data.date,
        due_date: data.due_date,
        reference: data.reference,
        status: data.status,
        line_amount_types: data.line_amount_types,
        line_items: data.line_items,
        currency_code: data.currency_code,
      };

      // Validate against tenant context
      validationResult = await adapter.validateInvoice(tenant_id, adapterPayload);

      // Calculate estimated total
      if (parseResult.data.line_items) {
        estimatedTotal = parseResult.data.line_items.reduce((sum, item) => {
          return sum + (item.quantity * item.unit_amount);
        }, 0);
        estimatedTotalAmount += estimatedTotal;
      }
    } else if (operation === 'create_contacts') {
      validationResult = await adapter.validateContact(tenant_id, payload);
    } else {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    results.push({
      index: i,
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      estimated_total: estimatedTotal,
    });

    if (validationResult.valid) {
      wouldSucceed++;
    } else {
      wouldFail++;
      validationResult.errors.forEach(err => {
        // Extract the field name from the error
        const match = err.match(/^([a-zA-Z_[\]0-9.]+)/);
        const key = match ? match[1] : 'other';
        issuesSummary.set(key, (issuesSummary.get(key) ?? 0) + 1);
      });
    }
  }

  const executionTimeMs = Date.now() - startTime;
  const successRate = payloads.length > 0 ? wouldSucceed / payloads.length : 0;

  // Convert issues summary to sorted array
  const issuesArray = Array.from(issuesSummary.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([issue, count]) => `${issue}: ${count} occurrence(s)`);

  const data: DryRunData = {
    operation,
    total_payloads: payloads.length,
    would_succeed: wouldSucceed,
    would_fail: wouldFail,
    success_rate: Math.round(successRate * 100) / 100,
    estimated_total_amount: operation === 'create_invoices' ? estimatedTotalAmount : undefined,
    results: verbosity === 'debug' ? results : results.filter(r => !r.valid),
    issues_summary: issuesArray,
  };

  let narrative: string;
  if (wouldFail === 0) {
    narrative = `Dry run complete: All ${payloads.length} ${operation.replace('_', ' ')} would succeed. ` +
      (operation === 'create_invoices' ? `Estimated total: $${estimatedTotalAmount.toFixed(2)}. ` : '') +
      `Safe to proceed with actual operation.`;
  } else {
    narrative = `Dry run complete: ${wouldSucceed}/${payloads.length} would succeed (${Math.round(successRate * 100)}%). ` +
      `${wouldFail} payload(s) have issues. ` +
      `Top issue: ${issuesArray[0] ?? 'Unknown'}. ` +
      `Fix the issues before running the actual operation.`;
  }

  const response = createResponse({
    success: wouldFail === 0,
    data,
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs,
    score: successRate,
    narrative,
    warnings: wouldFail > 0 ? [`${wouldFail} payload(s) would fail`] : undefined,
    recovery: wouldFail > 0 ? {
      suggested_action_id: 'fix_payloads',
      description: 'Fix the failing payloads and run dry_run_sync again',
      next_tool_call: {
        name: 'introspect_enums',
        arguments: {
          tenant_id,
          entity_type: operation === 'create_invoices' ? 'Account' : 'Contact',
          filter: { status: 'ACTIVE' },
        },
      },
    } : undefined,
  });
  auditLogResponse(response, 'dry_run_sync', tenant_id, executionTimeMs);
  return response;
}
