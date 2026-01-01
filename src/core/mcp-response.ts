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

/**
 * Helper to determine action type from tool name.
 * Exported for audit logging purposes.
 */
export function getActionType(toolName: string): 'read' | 'write' | 'validate' | 'simulate' {
  if (toolName.startsWith('create_') || toolName.startsWith('update_') || toolName.startsWith('delete_')) {
    return 'write';
  }
  if (toolName.includes('validate') || toolName.includes('introspect')) {
    return 'validate';
  }
  if (toolName.includes('simulate') || toolName.includes('dry_run') || toolName.includes('replay') || toolName.includes('seed') || toolName.includes('drive_')) {
    return 'simulate';
  }
  return 'read';
}

/**
 * Type declaration for logAudit to avoid circular dependency.
 * Tools should import logAudit from audit-logger directly.
 */
interface AuditLogEntry {
  tenant_id: string | null;
  tool_name: string;
  action_type: 'read' | 'write' | 'validate' | 'simulate';
  success: boolean;
  request_id: string;
  error_message?: string;
  execution_time_ms: number;
  metadata?: Record<string, unknown>;
}

declare let logAuditFn: ((entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => AuditLogEntry) | undefined;

/**
 * Logs an audit entry for a tool response.
 * Call this right before returning from a tool handler.
 *
 * @example
 * const response = createResponse({ ... });
 * auditLogResponse(response, 'create_invoice', tenant_id, Date.now() - startTime);
 * return response;
 */
export function auditLogResponse(
  response: MCPResponse,
  toolName: string,
  tenantId: string | null,
  executionTimeMs: number,
  metadata?: Record<string, unknown>
): void {
  if (typeof logAuditFn === 'undefined') {
    // Audit logging not initialized, skip silently
    return;
  }

  const requestId = response.meta?.request_id;
  if (!requestId) {
    // No request ID, can't log
    return;
  }

  logAuditFn({
    tenant_id: tenantId,
    tool_name: toolName,
    action_type: getActionType(toolName),
    success: response.success,
    request_id: requestId,
    error_message: response.success ? undefined : response.diagnostics?.narrative,
    execution_time_ms: executionTimeMs,
    metadata,
  });
}

/**
 * Initialize audit logging from the audit-logger module.
 * Called during server initialization to set up the logging function.
 */
export function initAuditLogging(logFn: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => AuditLogEntry): void {
  logAuditFn = logFn;
}
