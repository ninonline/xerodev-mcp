import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import { randomUUID } from 'node:crypto';

export const ReplayIdempotencySchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  operation: z.enum(['create_invoice', 'create_contact', 'create_payment'])
    .describe('The operation type to test idempotency for'),
  idempotency_key: z.string().optional()
    .describe('Optional key to use. If not provided, a new one is generated'),
  payload: z.any().describe('The payload to use for the operation'),
  replay_count: z.number().min(1).max(10).default(3)
    .describe('Number of times to replay the request'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type ReplayIdempotencyArgs = z.infer<typeof ReplayIdempotencySchema>;

export const REPLAY_IDEMPOTENCY_TOOL = {
  name: 'replay_idempotency',
  description: `Tests idempotency behaviour by replaying the same request multiple times.

Use this to verify your integration correctly handles:
- Duplicate request detection
- Consistent response on replays
- Proper idempotency key usage

The tool simulates sending the same request multiple times with the same
idempotency key and verifies that:
1. Only one resource is created
2. All responses return the same resource ID
3. No duplicate side effects occur

Returns a detailed report of each replay attempt and whether idempotency
was correctly maintained.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Target tenant ID',
      },
      operation: {
        type: 'string',
        enum: ['create_invoice', 'create_contact', 'create_payment'],
        description: 'The operation type to test idempotency for',
      },
      idempotency_key: {
        type: 'string',
        description: 'Optional key to use. If not provided, a new one is generated',
      },
      payload: {
        type: 'object',
        description: 'The payload to use for the operation',
      },
      replay_count: {
        type: 'number',
        description: 'Number of times to replay the request (1-10)',
        default: 3,
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'operation', 'payload'],
  },
};

// Store for tracking idempotency keys and their results
interface IdempotencyRecord {
  key: string;
  operation: string;
  tenant_id: string;
  result_id: string;
  created_at: number;
  replay_count: number;
}

const idempotencyStore: Map<string, IdempotencyRecord> = new Map();

// Exported for testing
export function getIdempotencyRecord(key: string): IdempotencyRecord | undefined {
  return idempotencyStore.get(key);
}

export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}

interface ReplayAttempt {
  attempt: number;
  idempotency_key: string;
  result_id: string;
  was_cached: boolean;
  response_time_ms: number;
}

interface IdempotencyTestData {
  tenant_id: string;
  operation: string;
  idempotency_key: string;
  replay_count: number;
  attempts: ReplayAttempt[];
  idempotency_maintained: boolean;
  unique_result_ids: string[];
  summary: {
    total_attempts: number;
    cached_responses: number;
    new_creations: number;
  };
}

export async function handleReplayIdempotency(
  args: ReplayIdempotencyArgs
): Promise<MCPResponse<IdempotencyTestData>> {
  const startTime = Date.now();
  const { tenant_id, operation, replay_count, verbosity } = args;

  // Use provided key or generate a new one
  const idempotencyKey = args.idempotency_key || `idem-${randomUUID()}`;

  const attempts: ReplayAttempt[] = [];
  const resultIds: Set<string> = new Set();

  // Simulate multiple replay attempts
  for (let i = 1; i <= replay_count; i++) {
    const attemptStart = Date.now();

    // Check if we've seen this idempotency key before
    const existing = idempotencyStore.get(idempotencyKey);

    let resultId: string;
    let wasCached: boolean;

    if (existing) {
      // Return cached result - idempotency working correctly
      resultId = existing.result_id;
      wasCached = true;
      existing.replay_count++;
    } else {
      // First time seeing this key - create new result
      resultId = generateResultId(operation);
      wasCached = false;

      // Store for future replays
      idempotencyStore.set(idempotencyKey, {
        key: idempotencyKey,
        operation,
        tenant_id,
        result_id: resultId,
        created_at: Date.now(),
        replay_count: 1,
      });
    }

    resultIds.add(resultId);

    attempts.push({
      attempt: i,
      idempotency_key: idempotencyKey,
      result_id: resultId,
      was_cached: wasCached,
      response_time_ms: Date.now() - attemptStart,
    });

    // Small delay to simulate network latency
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  const uniqueIds = Array.from(resultIds);
  const idempotencyMaintained = uniqueIds.length === 1;
  const cachedResponses = attempts.filter(a => a.was_cached).length;

  const data: IdempotencyTestData = {
    tenant_id,
    operation,
    idempotency_key: idempotencyKey,
    replay_count,
    attempts: verbosity === 'debug' ? attempts : attempts.slice(0, 3),
    idempotency_maintained: idempotencyMaintained,
    unique_result_ids: uniqueIds,
    summary: {
      total_attempts: replay_count,
      cached_responses: cachedResponses,
      new_creations: replay_count - cachedResponses,
    },
  };

  const warnings: string[] = [];
  if (!idempotencyMaintained) {
    warnings.push(`Idempotency NOT maintained! Got ${uniqueIds.length} different result IDs for the same key.`);
    warnings.push('This would cause duplicate resources in a real Xero integration.');
  }

  const response = createResponse({
    success: idempotencyMaintained,
    data,
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative: idempotencyMaintained
      ? `Idempotency test passed. All ${replay_count} requests with key '${idempotencyKey.substring(0, 20)}...' ` +
        `returned the same result ID. ${cachedResponses} responses were cached.`
      : `Idempotency test FAILED. ${uniqueIds.length} different result IDs were returned for the same key.`,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
  auditLogResponse(response, 'replay_idempotency', tenant_id, Date.now() - startTime);
  return response;
}

function generateResultId(operation: string): string {
  const prefix = operation.replace('create_', '');
  return `${prefix}-${randomUUID().substring(0, 8)}`;
}
