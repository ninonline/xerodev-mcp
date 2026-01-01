import { z } from 'zod';
import { createResponse, auditLogResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';

export const SimulateNetworkSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  condition: z.enum(['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR', 'TOKEN_EXPIRED', 'INTERMITTENT'])
    .describe('Network condition to simulate'),
  duration_seconds: z.number().min(0).max(300).default(60)
    .describe('Duration to maintain the condition (0 to clear, max 300 seconds)'),
  failure_rate: z.number().min(0).max(1).default(1.0)
    .describe('Probability of failure (0.0-1.0), used for INTERMITTENT condition'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type SimulateNetworkArgs = z.infer<typeof SimulateNetworkSchema>;

export const SIMULATE_NETWORK_TOOL = {
  name: 'simulate_network_conditions',
  description: `Simulates various network conditions to test integration resilience.

Use this to test how your integration handles:
- RATE_LIMIT: Simulates Xero's 60 requests/minute rate limit (429 responses)
- TIMEOUT: Simulates slow/hanging connections
- SERVER_ERROR: Simulates 500/502/503 errors
- TOKEN_EXPIRED: Simulates OAuth token expiration (401 responses)
- INTERMITTENT: Random failures at specified rate

The simulation affects subsequent tool calls for the specified duration.
Call with duration_seconds=0 to clear any active simulation.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Target tenant ID',
      },
      condition: {
        type: 'string',
        enum: ['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR', 'TOKEN_EXPIRED', 'INTERMITTENT'],
        description: 'Network condition to simulate',
      },
      duration_seconds: {
        type: 'number',
        description: 'Duration to maintain the condition (max 300 seconds)',
        default: 60,
      },
      failure_rate: {
        type: 'number',
        description: 'Probability of failure for INTERMITTENT condition',
        default: 1.0,
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'condition'],
  },
};

// Global state for active simulations
interface ActiveSimulation {
  tenant_id: string;
  condition: string;
  failure_rate: number;
  expires_at: number;
  request_count: number;
}

const activeSimulations: Map<string, ActiveSimulation> = new Map();

// Exported for use by other tools
export function getActiveSimulation(tenantId: string): ActiveSimulation | null {
  const sim = activeSimulations.get(tenantId);
  if (!sim) return null;

  // Check if expired
  if (Date.now() > sim.expires_at) {
    activeSimulations.delete(tenantId);
    return null;
  }

  return sim;
}

export function clearSimulation(tenantId: string): void {
  activeSimulations.delete(tenantId);
}

export function checkSimulation(tenantId: string): { shouldFail: boolean; error?: SimulatedError } {
  const sim = getActiveSimulation(tenantId);
  if (!sim) {
    return { shouldFail: false };
  }

  sim.request_count++;

  switch (sim.condition) {
    case 'RATE_LIMIT':
      return {
        shouldFail: true,
        error: {
          type: 'RATE_LIMIT',
          status: 429,
          message: 'Rate limit exceeded. Xero allows 60 requests per minute per tenant.',
          retry_after: 60,
        },
      };

    case 'TIMEOUT':
      return {
        shouldFail: true,
        error: {
          type: 'TIMEOUT',
          status: 408,
          message: 'Request timeout. The server took too long to respond.',
        },
      };

    case 'SERVER_ERROR':
      const errorCodes = [500, 502, 503];
      const errorCode = errorCodes[Math.floor(Math.random() * errorCodes.length)];
      return {
        shouldFail: true,
        error: {
          type: 'SERVER_ERROR',
          status: errorCode,
          message: `Server error (${errorCode}). Xero is experiencing issues.`,
        },
      };

    case 'TOKEN_EXPIRED':
      return {
        shouldFail: true,
        error: {
          type: 'TOKEN_EXPIRED',
          status: 401,
          message: 'OAuth token has expired. Re-authentication required.',
        },
      };

    case 'INTERMITTENT':
      if (Math.random() < sim.failure_rate) {
        return {
          shouldFail: true,
          error: {
            type: 'INTERMITTENT',
            status: 503,
            message: 'Intermittent failure. Service temporarily unavailable.',
          },
        };
      }
      return { shouldFail: false };

    default:
      return { shouldFail: false };
  }
}

export interface SimulatedError {
  type: string;
  status: number;
  message: string;
  retry_after?: number;
}

interface SimulationData {
  tenant_id: string;
  condition: string;
  duration_seconds: number;
  failure_rate: number;
  expires_at: string;
  status: 'active' | 'cleared';
  previous_simulation?: {
    condition: string;
    request_count: number;
  };
}

export async function handleSimulateNetwork(
  args: SimulateNetworkArgs
): Promise<MCPResponse<SimulationData>> {
  const startTime = Date.now();
  const { tenant_id, condition, duration_seconds, failure_rate, verbosity } = args;

  // Get any existing simulation
  const existing = getActiveSimulation(tenant_id);

  // Clear simulation if duration is 0
  if (duration_seconds === 0) {
    clearSimulation(tenant_id);
    const clearResponse = createResponse({
      success: true,
      data: {
        tenant_id,
        condition,
        duration_seconds: 0,
        failure_rate,
        expires_at: new Date().toISOString(),
        status: 'cleared' as const,
        previous_simulation: existing ? {
          condition: existing.condition,
          request_count: existing.request_count,
        } : undefined,
      },
      verbosity: verbosity as VerbosityLevel,
      executionTimeMs: Date.now() - startTime,
      narrative: existing
        ? `Cleared ${existing.condition} simulation for tenant ${tenant_id}. ${existing.request_count} requests were affected.`
        : `No active simulation to clear for tenant ${tenant_id}.`,
    });
    auditLogResponse(clearResponse, 'simulate_network_conditions', tenant_id, Date.now() - startTime);
    return clearResponse;
  }

  // Create new simulation
  const expiresAt = Date.now() + (duration_seconds * 1000);
  const simulation: ActiveSimulation = {
    tenant_id,
    condition,
    failure_rate: condition === 'INTERMITTENT' ? failure_rate : 1.0,
    expires_at: expiresAt,
    request_count: 0,
  };

  activeSimulations.set(tenant_id, simulation);

  const conditionDescriptions: Record<string, string> = {
    RATE_LIMIT: 'All requests will receive 429 Too Many Requests responses',
    TIMEOUT: 'All requests will timeout',
    SERVER_ERROR: 'All requests will receive random 5xx errors',
    TOKEN_EXPIRED: 'All requests will receive 401 Unauthorized responses',
    INTERMITTENT: `${Math.round(failure_rate * 100)}% of requests will fail randomly`,
  };

  const activateResponse = createResponse({
    success: true,
    data: {
      tenant_id,
      condition,
      duration_seconds,
      failure_rate: simulation.failure_rate,
      expires_at: new Date(expiresAt).toISOString(),
      status: 'active' as const,
      previous_simulation: existing ? {
        condition: existing.condition,
        request_count: existing.request_count,
      } : undefined,
    },
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative: `${condition} simulation activated for tenant ${tenant_id}. ` +
      `${conditionDescriptions[condition]}. ` +
      `Simulation expires in ${duration_seconds} seconds. ` +
      `Call with duration_seconds=0 to clear.`,
    warnings: [
      'This simulation affects all subsequent tool calls for this tenant',
      'Remember to clear the simulation when testing is complete',
    ],
  });
  auditLogResponse(activateResponse, 'simulate_network_conditions', tenant_id, Date.now() - startTime);
  return activateResponse;
}
