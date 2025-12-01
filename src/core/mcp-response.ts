import { randomUUID } from 'node:crypto';

/**
 * Verbosity levels for progressive disclosure of information.
 * - silent: Only success/data (minimal tokens)
 * - compact: Adds metadata (timestamp, request_id, score)
 * - diagnostic: Adds narrative, warnings, recovery suggestions
 * - debug: Adds full execution trace (SQL queries, logs)
 */
export type VerbosityLevel = 'silent' | 'compact' | 'diagnostic' | 'debug';

/**
 * Suggested recovery action when an operation fails.
 */
export interface RecoveryAction {
  /** Unique identifier for this recovery suggestion */
  suggested_action_id: string;
  /** Human-readable description */
  description?: string;
  /** The next tool call the AI should make to recover */
  next_tool_call?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Standardised response format for all MCP tool calls.
 */
export interface MCPResponse<T = unknown> {
  success: boolean;
  data: T;

  meta?: {
    timestamp: string;
    request_id: string;
    execution_time_ms?: number;
    /** Compliance/health score from 0.0 to 1.0 */
    score?: number;
  };

  diagnostics?: {
    /** Natural language explanation of what happened */
    narrative: string;
    warnings?: string[];
    root_cause?: string;
  };

  debug?: {
    logs?: string[];
    sql_queries?: string[];
  };

  /** Recovery suggestions when operation fails */
  recovery?: RecoveryAction;
}

/**
 * Options for creating an MCP response.
 */
export interface CreateResponseOptions<T> {
  success: boolean;
  data: T;
  verbosity?: VerbosityLevel;

  // Metadata
  executionTimeMs?: number;
  score?: number;

  // Diagnostics
  narrative?: string;
  warnings?: string[];
  rootCause?: string;

  // Recovery
  recovery?: RecoveryAction;

  // Debug
  logs?: string[];
  sqlQueries?: string[];
}

/**
 * Creates a standardised MCP response with progressive verbosity.
 */
export function createResponse<T>(options: CreateResponseOptions<T>): MCPResponse<T> {
  const {
    success,
    data,
    verbosity = 'compact',
    executionTimeMs,
    score,
    narrative,
    warnings,
    rootCause,
    recovery,
    logs,
    sqlQueries,
  } = options;

  const response: MCPResponse<T> = {
    success,
    data,
  };

  // Silent mode: just success and data
  if (verbosity === 'silent') {
    return response;
  }

  // Compact mode and above: add metadata
  response.meta = {
    timestamp: new Date().toISOString(),
    request_id: randomUUID(),
    execution_time_ms: executionTimeMs,
    score: score ?? (success ? 1.0 : 0.0),
  };

  // Diagnostic mode and above: add narrative and recovery suggestions
  if (verbosity === 'diagnostic' || verbosity === 'debug') {
    response.diagnostics = {
      narrative: narrative ?? (success
        ? 'Operation completed successfully.'
        : 'Operation failed. Check diagnostics for details.'),
      warnings: warnings ?? [],
      root_cause: rootCause,
    };

    if (recovery) {
      response.recovery = recovery;
    }
  }

  // Debug mode: add execution trace
  if (verbosity === 'debug') {
    response.debug = {
      logs: logs ?? [],
      sql_queries: sqlQueries ?? [],
    };
  }

  return response;
}

/**
 * Shorthand for creating a successful response.
 */
export function successResponse<T>(
  data: T,
  options?: Partial<Omit<CreateResponseOptions<T>, 'success' | 'data'>>
): MCPResponse<T> {
  return createResponse({
    success: true,
    data,
    ...options,
  });
}

/**
 * Shorthand for creating a failure response with recovery suggestion.
 */
export function failureResponse<T>(
  data: T,
  options: Omit<CreateResponseOptions<T>, 'success' | 'data'> & {
    narrative: string;
  }
): MCPResponse<T> {
  return createResponse({
    success: false,
    data,
    verbosity: options.verbosity ?? 'diagnostic',
    ...options,
  });
}
