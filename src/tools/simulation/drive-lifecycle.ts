import { z } from 'zod';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { type XeroAdapter } from '../../adapters/adapter-factory.js';
import { type Invoice, type Quote, type CreditNote } from '../../adapters/adapter-interface.js';

// Valid state transitions for each entity type
const INVOICE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'AUTHORISED', 'VOIDED'],
  SUBMITTED: ['AUTHORISED', 'DRAFT', 'VOIDED'],
  AUTHORISED: ['PAID', 'VOIDED'],
  PAID: [], // Terminal state - no transitions allowed
  VOIDED: [], // Terminal state - no transitions allowed
};

const QUOTE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT', 'DECLINED'],
  SENT: ['ACCEPTED', 'DECLINED', 'DRAFT'],
  ACCEPTED: ['INVOICED'],
  DECLINED: ['DRAFT'], // Can revert to draft for editing
  INVOICED: [], // Terminal state
};

const CREDIT_NOTE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'AUTHORISED', 'VOIDED'],
  SUBMITTED: ['AUTHORISED', 'DRAFT', 'VOIDED'],
  AUTHORISED: ['PAID', 'VOIDED'],
  PAID: [], // Terminal state
  VOIDED: [], // Terminal state
};

export const DriveLifecycleSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  entity_type: z.enum(['Invoice', 'Quote', 'CreditNote']).describe('Type of entity to transition'),
  entity_id: z.string().describe('ID of the entity to transition'),
  target_state: z.string().describe('Target state to transition to'),
  payment_amount: z.number().optional().describe('Payment amount (required when transitioning to PAID)'),
  payment_account_id: z.string().optional().describe('Bank account ID for payment (required when transitioning to PAID)'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type DriveLifecycleArgs = z.infer<typeof DriveLifecycleSchema>;

export const DRIVE_LIFECYCLE_TOOL = {
  name: 'drive_lifecycle',
  description: `Transitions an entity through its lifecycle states.

**USE CASES:**
- Test invoice approval workflows
- Simulate payment scenarios
- Test quote acceptance flows
- Verify state machine behaviour

**INVOICE STATES:**
- DRAFT → SUBMITTED → AUTHORISED → PAID
- Any state → VOIDED (except PAID)

**QUOTE STATES:**
- DRAFT → SENT → ACCEPTED → INVOICED
- SENT/ACCEPTED → DECLINED
- DECLINED → DRAFT (for re-editing)

**CREDIT NOTE STATES:**
- DRAFT → SUBMITTED → AUTHORISED → PAID
- Any state → VOIDED (except PAID)

**PAYMENT TRANSITIONS:**
When transitioning to PAID, you must provide:
- payment_amount: The payment amount
- payment_account_id: Bank account for the payment

**EXAMPLE:**
Transition invoice through full lifecycle:
1. drive_lifecycle(Invoice, inv-001, AUTHORISED)
2. drive_lifecycle(Invoice, inv-001, PAID, amount=1000, account=acc-027)`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: { type: 'string', description: 'Target tenant ID' },
      entity_type: {
        type: 'string',
        enum: ['Invoice', 'Quote', 'CreditNote'],
        description: 'Type of entity to transition',
      },
      entity_id: { type: 'string', description: 'ID of the entity to transition' },
      target_state: { type: 'string', description: 'Target state to transition to' },
      payment_amount: { type: 'number', description: 'Payment amount (for PAID transition)' },
      payment_account_id: { type: 'string', description: 'Bank account ID (for PAID transition)' },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'entity_type', 'entity_id', 'target_state'],
  },
};

interface TransitionResult {
  entity_type: string;
  entity_id: string;
  previous_state: string;
  new_state: string;
  transition_path: string[];
  payment_created?: {
    payment_id: string;
    amount: number;
  };
  invoice_created?: {
    invoice_id: string;
    from_quote: string;
  };
}

export async function handleDriveLifecycle(
  args: DriveLifecycleArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<TransitionResult | { error: string; details?: unknown }>> {
  const startTime = Date.now();
  const {
    tenant_id,
    entity_type,
    entity_id,
    target_state,
    payment_amount,
    payment_account_id,
    verbosity = 'diagnostic',
  } = args;

  // Get valid transitions based on entity type
  let transitions: Record<string, string[]>;
  let validStates: string[];

  switch (entity_type) {
    case 'Invoice':
      transitions = INVOICE_TRANSITIONS;
      validStates = ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED'];
      break;
    case 'Quote':
      transitions = QUOTE_TRANSITIONS;
      validStates = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'INVOICED'];
      break;
    case 'CreditNote':
      transitions = CREDIT_NOTE_TRANSITIONS;
      validStates = ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED'];
      break;
    default:
      return createResponse({
        success: false,
        data: { error: `Unsupported entity type: ${entity_type}` },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: `Entity type '${entity_type}' is not supported for lifecycle transitions.`,
      });
  }

  // Validate target state
  if (!validStates.includes(target_state)) {
    return createResponse({
      success: false,
      data: {
        error: `Invalid target state '${target_state}' for ${entity_type}`,
        details: { valid_states: validStates },
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Target state '${target_state}' is not valid for ${entity_type}. Valid states: ${validStates.join(', ')}.`,
    });
  }

  // Check payment requirements for PAID transition
  if (target_state === 'PAID') {
    if (!payment_amount || payment_amount <= 0) {
      return createResponse({
        success: false,
        data: { error: 'payment_amount is required and must be positive when transitioning to PAID' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'To transition to PAID state, you must provide a positive payment_amount.',
        recovery: {
          suggested_action_id: 'provide_payment_details',
          description: 'Provide payment_amount and payment_account_id',
        },
      });
    }
    if (!payment_account_id) {
      return createResponse({
        success: false,
        data: { error: 'payment_account_id is required when transitioning to PAID' },
        verbosity: verbosity as VerbosityLevel,
        executionTimeMs: Date.now() - startTime,
        narrative: 'To transition to PAID state, you must provide a payment_account_id.',
        recovery: {
          suggested_action_id: 'find_bank_accounts',
          description: 'Find valid bank accounts',
          next_tool_call: {
            name: 'introspect_enums',
            arguments: { tenant_id, entity_type: 'Account', filter: { type: 'BANK', status: 'ACTIVE' } },
          },
        },
      });
    }
  }

  // Fetch the entity
  let entity: Invoice | Quote | CreditNote | undefined;
  let currentState: string;

  try {
    if (entity_type === 'Invoice') {
      const invoices = await adapter.getInvoices(tenant_id, {});
      entity = invoices.find(i => i.invoice_id === entity_id);
    } else if (entity_type === 'Quote') {
      const quotes = await adapter.getQuotes(tenant_id, {});
      entity = quotes.find(q => q.quote_id === entity_id);
    } else if (entity_type === 'CreditNote') {
      const creditNotes = await adapter.getCreditNotes(tenant_id, {});
      entity = creditNotes.find(cn => cn.credit_note_id === entity_id);
    }
  } catch (error) {
    return createResponse({
      success: false,
      data: { error: `Failed to fetch ${entity_type}: ${error instanceof Error ? error.message : 'Unknown error'}` },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Could not fetch ${entity_type} with ID '${entity_id}'.`,
    });
  }

  if (!entity) {
    return createResponse({
      success: false,
      data: { error: `${entity_type} '${entity_id}' not found` },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `${entity_type} with ID '${entity_id}' was not found in tenant '${tenant_id}'.`,
      recovery: {
        suggested_action_id: 'list_entities',
        description: `List available ${entity_type}s`,
        next_tool_call: {
          name: 'introspect_enums',
          arguments: { tenant_id, entity_type },
        },
      },
    });
  }

  currentState = entity.status;

  // Check if already in target state
  if (currentState === target_state) {
    return createResponse({
      success: true,
      data: {
        entity_type,
        entity_id,
        previous_state: currentState,
        new_state: target_state,
        transition_path: [currentState],
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `${entity_type} '${entity_id}' is already in state '${target_state}'. No transition needed.`,
    });
  }

  // Find transition path
  const path = findTransitionPath(currentState, target_state, transitions);

  if (!path) {
    const allowedTransitions = transitions[currentState] || [];
    return createResponse({
      success: false,
      data: {
        error: `Cannot transition from '${currentState}' to '${target_state}'`,
        details: {
          current_state: currentState,
          allowed_transitions: allowedTransitions,
        },
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Invalid transition: ${entity_type} cannot go from '${currentState}' to '${target_state}'. ` +
        `Allowed transitions from '${currentState}': ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'none (terminal state)'}.`,
    });
  }

  // Execute the transition
  const result: TransitionResult = {
    entity_type,
    entity_id,
    previous_state: currentState,
    new_state: target_state,
    transition_path: path,
  };

  // Apply the transition(s)
  try {
    for (let i = 1; i < path.length; i++) {
      const nextState = path[i];

      // Special handling for PAID state - create payment
      if (nextState === 'PAID' && (entity_type === 'Invoice' || entity_type === 'CreditNote')) {
        const payment = await adapter.createPayment(tenant_id, {
          invoice: entity_type === 'Invoice' ? { invoice_id: entity_id } : undefined,
          credit_note: entity_type === 'CreditNote' ? { credit_note_id: entity_id } : undefined,
          account: { account_id: payment_account_id! },
          amount: payment_amount!,
          date: new Date().toISOString().split('T')[0],
          status: 'AUTHORISED',
        });
        result.payment_created = {
          payment_id: payment.payment_id,
          amount: payment.amount,
        };
      }

      // Special handling for INVOICED state - create invoice from quote
      if (nextState === 'INVOICED' && entity_type === 'Quote') {
        const quote = entity as Quote;
        const invoice = await adapter.createInvoice(tenant_id, {
          type: 'ACCREC',
          contact: quote.contact,
          date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'DRAFT',
          line_amount_types: quote.line_amount_types,
          line_items: quote.line_items,
          currency_code: quote.currency_code,
        });
        result.invoice_created = {
          invoice_id: invoice.invoice_id,
          from_quote: entity_id,
        };
      }

      // Update entity status
      await adapter.updateEntityStatus(tenant_id, entity_type, entity_id, nextState);
    }
  } catch (error) {
    return createResponse({
      success: false,
      data: {
        error: `Failed to apply transition: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { partial_path: path },
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: `Transition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Build narrative
  let narrative = `Successfully transitioned ${entity_type} '${entity_id}' from '${currentState}' to '${target_state}'.`;
  if (path.length > 2) {
    narrative += ` Transition path: ${path.join(' → ')}.`;
  }
  if (result.payment_created) {
    narrative += ` Payment of ${result.payment_created.amount} created (ID: ${result.payment_created.payment_id}).`;
  }
  if (result.invoice_created) {
    narrative += ` Invoice created from quote (ID: ${result.invoice_created.invoice_id}).`;
  }

  return createResponse({
    success: true,
    data: result,
    verbosity: verbosity as VerbosityLevel,
    score: 1.0,
    executionTimeMs: Date.now() - startTime,
    narrative,
  });
}

/**
 * Find the shortest path from current state to target state using BFS
 */
function findTransitionPath(
  current: string,
  target: string,
  transitions: Record<string, string[]>
): string[] | null {
  if (current === target) {
    return [current];
  }

  const queue: string[][] = [[current]];
  const visited = new Set<string>([current]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const lastState = path[path.length - 1];
    const nextStates = transitions[lastState] || [];

    for (const nextState of nextStates) {
      if (nextState === target) {
        return [...path, nextState];
      }

      if (!visited.has(nextState)) {
        visited.add(nextState);
        queue.push([...path, nextState]);
      }
    }
  }

  return null;
}
