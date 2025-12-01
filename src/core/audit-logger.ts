import { randomUUID } from 'node:crypto';

/**
 * Audit Logger
 *
 * Tracks all tool invocations for compliance and debugging purposes.
 * In production, this would write to SQLite. For now, uses in-memory storage.
 */

export interface AuditEntry {
  id: string;
  tenant_id: string | null;
  tool_name: string;
  action_type: 'read' | 'write' | 'validate' | 'simulate';
  success: boolean;
  request_id: string;
  error_message?: string;
  execution_time_ms: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// In-memory storage (would be SQLite in production)
const auditLog: AuditEntry[] = [];

// Maximum entries to keep in memory
const MAX_ENTRIES = 1000;

/**
 * Log an audit entry for a tool invocation.
 */
export function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  const fullEntry: AuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  auditLog.push(fullEntry);

  // Trim old entries if exceeding max
  if (auditLog.length > MAX_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_ENTRIES);
  }

  return fullEntry;
}

/**
 * Get audit entries, optionally filtered.
 */
export function getAuditEntries(options?: {
  tenant_id?: string;
  tool_name?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}): AuditEntry[] {
  let entries = [...auditLog];

  if (options?.tenant_id) {
    entries = entries.filter(e => e.tenant_id === options.tenant_id);
  }

  if (options?.tool_name) {
    entries = entries.filter(e => e.tool_name === options.tool_name);
  }

  if (options?.success !== undefined) {
    entries = entries.filter(e => e.success === options.success);
  }

  // Sort by timestamp descending (most recent first)
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;

  return entries.slice(offset, offset + limit);
}

/**
 * Get audit statistics for a tenant.
 */
export function getAuditStats(tenantId?: string): AuditStats {
  let entries = auditLog;

  if (tenantId) {
    entries = entries.filter(e => e.tenant_id === tenantId);
  }

  const total = entries.length;
  const successful = entries.filter(e => e.success).length;
  const failed = total - successful;

  const byTool: Record<string, number> = {};
  const byAction: Record<string, number> = {};

  for (const entry of entries) {
    byTool[entry.tool_name] = (byTool[entry.tool_name] ?? 0) + 1;
    byAction[entry.action_type] = (byAction[entry.action_type] ?? 0) + 1;
  }

  const avgExecutionTime = entries.length > 0
    ? entries.reduce((sum, e) => sum + e.execution_time_ms, 0) / entries.length
    : 0;

  return {
    total_entries: total,
    successful,
    failed,
    success_rate: total > 0 ? successful / total : 1,
    by_tool: byTool,
    by_action: byAction,
    avg_execution_time_ms: Math.round(avgExecutionTime),
  };
}

export interface AuditStats {
  total_entries: number;
  successful: number;
  failed: number;
  success_rate: number;
  by_tool: Record<string, number>;
  by_action: Record<string, number>;
  avg_execution_time_ms: number;
}

/**
 * Clear all audit entries (for testing).
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

/**
 * Get the current audit log size.
 */
export function getAuditLogSize(): number {
  return auditLog.length;
}

/**
 * Helper to determine action type from tool name.
 */
export function getActionType(toolName: string): 'read' | 'write' | 'validate' | 'simulate' {
  if (toolName.startsWith('create_') || toolName.startsWith('update_') || toolName.startsWith('delete_')) {
    return 'write';
  }
  if (toolName.includes('validate') || toolName.includes('introspect')) {
    return 'validate';
  }
  if (toolName.includes('simulate') || toolName.includes('dry_run') || toolName.includes('replay') || toolName.includes('seed')) {
    return 'simulate';
  }
  return 'read';
}
