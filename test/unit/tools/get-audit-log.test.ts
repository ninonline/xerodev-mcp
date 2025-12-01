import { describe, it, expect, beforeEach } from 'vitest';
import { handleGetAuditLog } from '../../../src/tools/core/get-audit-log.js';
import { logAudit, clearAuditLog } from '../../../src/core/audit-logger.js';

describe('get_audit_log', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  describe('basic functionality', () => {
    it('should return empty entries for empty log', async () => {
      const result = await handleGetAuditLog({
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.entries.length).toBe(0);
      expect(result.data.stats?.total_entries).toBe(0);
    });

    it('should return audit entries', async () => {
      logAudit({
        tenant_id: 'acme-au-001',
        tool_name: 'create_invoice',
        action_type: 'write',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 50,
      });

      logAudit({
        tenant_id: 'acme-au-001',
        tool_name: 'validate_schema_match',
        action_type: 'validate',
        success: false,
        request_id: 'req-2',
        execution_time_ms: 20,
      });

      const result = await handleGetAuditLog({
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.success).toBe(true);
      expect(result.data.entries.length).toBe(2);
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'create_invoice',
        action_type: 'write',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 50,
      });

      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'validate_schema_match',
        action_type: 'validate',
        success: false,
        request_id: 'req-2',
        execution_time_ms: 20,
      });

      logAudit({
        tenant_id: 'tenant-b',
        tool_name: 'create_invoice',
        action_type: 'write',
        success: true,
        request_id: 'req-3',
        execution_time_ms: 30,
      });
    });

    it('should filter by tenant_id', async () => {
      const result = await handleGetAuditLog({
        tenant_id: 'tenant-a',
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.data.entries.length).toBe(2);
      result.data.entries.forEach(e => expect(e.tenant_id).toBe('tenant-a'));
    });

    it('should filter by tool_name', async () => {
      const result = await handleGetAuditLog({
        tool_name: 'create_invoice',
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.data.entries.length).toBe(2);
      result.data.entries.forEach(e => expect(e.tool_name).toBe('create_invoice'));
    });

    it('should filter by success status', async () => {
      const successResult = await handleGetAuditLog({
        success: true,
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(successResult.data.entries.length).toBe(2);

      const failedResult = await handleGetAuditLog({
        success: false,
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(failedResult.data.entries.length).toBe(1);
    });

    it('should combine multiple filters', async () => {
      const result = await handleGetAuditLog({
        tenant_id: 'tenant-a',
        success: true,
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.data.entries.length).toBe(1);
      expect(result.data.entries[0].tool_name).toBe('create_invoice');
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      for (let i = 0; i < 25; i++) {
        logAudit({
          tenant_id: 'tenant-a',
          tool_name: 'test_tool',
          action_type: 'read',
          success: true,
          request_id: `req-${i}`,
          execution_time_ms: 10,
        });
      }
    });

    it('should respect limit', async () => {
      const result = await handleGetAuditLog({
        limit: 10,
        offset: 0,
        include_stats: false,
        verbosity: 'diagnostic',
      });

      expect(result.data.entries.length).toBe(10);
      expect(result.data.pagination.limit).toBe(10);
      expect(result.data.pagination.has_more).toBe(true);
    });

    it('should respect offset', async () => {
      const result = await handleGetAuditLog({
        limit: 10,
        offset: 20,
        include_stats: false,
        verbosity: 'diagnostic',
      });

      expect(result.data.entries.length).toBe(5);
      expect(result.data.pagination.offset).toBe(20);
      expect(result.data.pagination.has_more).toBe(false);
    });

    it('should indicate when there are more results', async () => {
      const resultWithMore = await handleGetAuditLog({
        limit: 10,
        offset: 0,
        include_stats: false,
        verbosity: 'diagnostic',
      });

      expect(resultWithMore.data.pagination.has_more).toBe(true);

      const resultWithoutMore = await handleGetAuditLog({
        limit: 30,
        offset: 0,
        include_stats: false,
        verbosity: 'diagnostic',
      });

      expect(resultWithoutMore.data.pagination.has_more).toBe(false);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'create_invoice',
        action_type: 'write',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 100,
      });

      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'validate_schema_match',
        action_type: 'validate',
        success: false,
        request_id: 'req-2',
        execution_time_ms: 50,
      });
    });

    it('should include stats when requested', async () => {
      const result = await handleGetAuditLog({
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.data.stats).toBeDefined();
      expect(result.data.stats?.total_entries).toBe(2);
      expect(result.data.stats?.successful).toBe(1);
      expect(result.data.stats?.failed).toBe(1);
    });

    it('should exclude stats when not requested', async () => {
      const result = await handleGetAuditLog({
        include_stats: false,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.data.stats).toBeUndefined();
    });

    it('should filter stats by tenant when filtering entries', async () => {
      logAudit({
        tenant_id: 'tenant-b',
        tool_name: 'get_mcp_capabilities',
        action_type: 'read',
        success: true,
        request_id: 'req-3',
        execution_time_ms: 10,
      });

      const result = await handleGetAuditLog({
        tenant_id: 'tenant-a',
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.data.stats?.total_entries).toBe(2);
    });
  });

  describe('verbosity', () => {
    it('should include narrative in diagnostic mode', async () => {
      logAudit({
        tenant_id: 'acme-au-001',
        tool_name: 'test',
        action_type: 'read',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 10,
      });

      const result = await handleGetAuditLog({
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.diagnostics?.narrative).toBeDefined();
      expect(result.diagnostics?.narrative).toContain('Retrieved');
    });

    it('should mention filter criteria in narrative', async () => {
      logAudit({
        tenant_id: 'acme-au-001',
        tool_name: 'test',
        action_type: 'read',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 10,
      });

      const result = await handleGetAuditLog({
        tenant_id: 'acme-au-001',
        tool_name: 'test',
        include_stats: true,
        limit: 20,
        offset: 0,
        verbosity: 'diagnostic',
      });

      expect(result.diagnostics?.narrative).toContain('acme-au-001');
      expect(result.diagnostics?.narrative).toContain('test');
    });
  });
});
