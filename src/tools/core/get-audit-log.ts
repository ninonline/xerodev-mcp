import { z } from 'zod';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';
import {
  getAuditEntries,
  getAuditStats,
  type AuditEntry,
  type AuditStats,
} from '../../core/audit-logger.js';

export const GetAuditLogSchema = z.object({
  tenant_id: z.string().optional().describe('Filter by tenant ID'),
  tool_name: z.string().optional().describe('Filter by tool name'),
  success: z.boolean().optional().describe('Filter by success status'),
  include_stats: z.boolean().default(true).describe('Include statistics summary'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum entries to return'),
  offset: z.number().min(0).default(0).describe('Offset for pagination'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type GetAuditLogArgs = z.infer<typeof GetAuditLogSchema>;

export const GET_AUDIT_LOG_TOOL = {
  name: 'get_audit_log',
  description: `Retrieves audit log entries for tool invocations.

Use this to:
- Debug issues by reviewing past tool calls
- Track success/failure rates
- Monitor usage patterns per tenant
- Identify problematic operations

Supports filtering by tenant, tool name, and success status.
Includes statistics summary by default.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Filter by tenant ID',
      },
      tool_name: {
        type: 'string',
        description: 'Filter by tool name',
      },
      success: {
        type: 'boolean',
        description: 'Filter by success status',
      },
      include_stats: {
        type: 'boolean',
        default: true,
        description: 'Include statistics summary',
      },
      limit: {
        type: 'number',
        default: 20,
        description: 'Maximum entries to return (1-100)',
      },
      offset: {
        type: 'number',
        default: 0,
        description: 'Offset for pagination',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
  },
};

interface AuditLogData {
  entries: AuditEntry[];
  stats?: AuditStats;
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export async function handleGetAuditLog(
  args: GetAuditLogArgs
): Promise<MCPResponse<AuditLogData>> {
  const startTime = Date.now();
  const { tenant_id, tool_name, success, include_stats, limit, offset, verbosity } = args;

  // Get filtered entries
  const entries = getAuditEntries({
    tenant_id,
    tool_name,
    success,
    limit: limit + 1, // Get one extra to check if there's more
    offset,
  });

  const hasMore = entries.length > limit;
  const returnedEntries = hasMore ? entries.slice(0, limit) : entries;

  // Get stats if requested
  const stats = include_stats ? getAuditStats(tenant_id) : undefined;

  const data: AuditLogData = {
    entries: returnedEntries,
    stats,
    pagination: {
      limit,
      offset,
      has_more: hasMore,
    },
  };

  // Build narrative
  let narrative = `Retrieved ${returnedEntries.length} audit entries`;
  if (tenant_id) {
    narrative += ` for tenant ${tenant_id}`;
  }
  if (tool_name) {
    narrative += ` (tool: ${tool_name})`;
  }
  if (success !== undefined) {
    narrative += ` (${success ? 'successful' : 'failed'} only)`;
  }
  narrative += '.';

  if (stats) {
    narrative += ` Overall: ${stats.successful}/${stats.total_entries} successful (${Math.round(stats.success_rate * 100)}%).`;
    narrative += ` Avg execution: ${stats.avg_execution_time_ms}ms.`;
  }

  return createResponse({
    success: true,
    data,
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs: Date.now() - startTime,
    narrative,
  });
}
