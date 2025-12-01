import { describe, it, expect, beforeEach } from 'vitest';
import {
  logAudit,
  getAuditEntries,
  getAuditStats,
  clearAuditLog,
  getAuditLogSize,
  getActionType,
} from '../../../src/core/audit-logger.js';

describe('audit-logger', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  describe('logAudit', () => {
    it('should create an audit entry with all fields', () => {
      const entry = logAudit({
        tenant_id: 'acme-au-001',
        tool_name: 'validate_schema_match',
        action_type: 'validate',
        success: true,
        request_id: 'req-123',
        execution_time_ms: 42,
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.tenant_id).toBe('acme-au-001');
      expect(entry.tool_name).toBe('validate_schema_match');
      expect(entry.action_type).toBe('validate');
      expect(entry.success).toBe(true);
      expect(entry.execution_time_ms).toBe(42);
    });

    it('should include optional error message', () => {
      const entry = logAudit({
        tenant_id: 'acme-au-001',
        tool_name: 'create_invoice',
        action_type: 'write',
        success: false,
        request_id: 'req-456',
        execution_time_ms: 15,
        error_message: 'Contact not found',
      });

      expect(entry.error_message).toBe('Contact not found');
    });

    it('should include optional metadata', () => {
      const entry = logAudit({
        tenant_id: 'acme-au-001',
        tool_name: 'create_contact',
        action_type: 'write',
        success: true,
        request_id: 'req-789',
        execution_time_ms: 20,
        metadata: { contact_id: 'contact-123' },
      });

      expect(entry.metadata).toEqual({ contact_id: 'contact-123' });
    });

    it('should increment log size', () => {
      expect(getAuditLogSize()).toBe(0);

      logAudit({
        tenant_id: null,
        tool_name: 'get_mcp_capabilities',
        action_type: 'read',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 5,
      });

      expect(getAuditLogSize()).toBe(1);

      logAudit({
        tenant_id: null,
        tool_name: 'get_mcp_capabilities',
        action_type: 'read',
        success: true,
        request_id: 'req-2',
        execution_time_ms: 3,
      });

      expect(getAuditLogSize()).toBe(2);
    });
  });

  describe('getAuditEntries', () => {
    beforeEach(() => {
      // Create some test entries
      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'validate_schema_match',
        action_type: 'validate',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 10,
      });

      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'create_invoice',
        action_type: 'write',
        success: false,
        request_id: 'req-2',
        execution_time_ms: 20,
      });

      logAudit({
        tenant_id: 'tenant-b',
        tool_name: 'introspect_enums',
        action_type: 'validate',
        success: true,
        request_id: 'req-3',
        execution_time_ms: 15,
      });
    });

    it('should return all entries without filters', () => {
      const entries = getAuditEntries();
      expect(entries.length).toBe(3);
    });

    it('should filter by tenant_id', () => {
      const entries = getAuditEntries({ tenant_id: 'tenant-a' });
      expect(entries.length).toBe(2);
      entries.forEach(e => expect(e.tenant_id).toBe('tenant-a'));
    });

    it('should filter by tool_name', () => {
      const entries = getAuditEntries({ tool_name: 'validate_schema_match' });
      expect(entries.length).toBe(1);
      expect(entries[0].tool_name).toBe('validate_schema_match');
    });

    it('should filter by success status', () => {
      const successEntries = getAuditEntries({ success: true });
      expect(successEntries.length).toBe(2);

      const failedEntries = getAuditEntries({ success: false });
      expect(failedEntries.length).toBe(1);
    });

    it('should support pagination with limit', () => {
      const entries = getAuditEntries({ limit: 2 });
      expect(entries.length).toBe(2);
    });

    it('should support pagination with offset', () => {
      const allEntries = getAuditEntries();
      const offsetEntries = getAuditEntries({ offset: 1, limit: 10 });

      expect(offsetEntries.length).toBe(2);
      expect(offsetEntries[0].request_id).toBe(allEntries[1].request_id);
    });

    it('should return entries sorted by timestamp descending', () => {
      const entries = getAuditEntries();

      for (let i = 1; i < entries.length; i++) {
        const prev = new Date(entries[i - 1].timestamp).getTime();
        const curr = new Date(entries[i].timestamp).getTime();
        expect(prev >= curr).toBe(true);
      }
    });
  });

  describe('getAuditStats', () => {
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
        tool_name: 'create_contact',
        action_type: 'write',
        success: true,
        request_id: 'req-2',
        execution_time_ms: 50,
      });

      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'validate_schema_match',
        action_type: 'validate',
        success: false,
        request_id: 'req-3',
        execution_time_ms: 30,
      });

      logAudit({
        tenant_id: 'tenant-b',
        tool_name: 'get_mcp_capabilities',
        action_type: 'read',
        success: true,
        request_id: 'req-4',
        execution_time_ms: 20,
      });
    });

    it('should calculate total entries', () => {
      const stats = getAuditStats();
      expect(stats.total_entries).toBe(4);
    });

    it('should calculate success/failure counts', () => {
      const stats = getAuditStats();
      expect(stats.successful).toBe(3);
      expect(stats.failed).toBe(1);
    });

    it('should calculate success rate', () => {
      const stats = getAuditStats();
      expect(stats.success_rate).toBe(0.75);
    });

    it('should group by tool', () => {
      const stats = getAuditStats();
      expect(stats.by_tool.create_invoice).toBe(1);
      expect(stats.by_tool.create_contact).toBe(1);
      expect(stats.by_tool.validate_schema_match).toBe(1);
      expect(stats.by_tool.get_mcp_capabilities).toBe(1);
    });

    it('should group by action type', () => {
      const stats = getAuditStats();
      expect(stats.by_action.write).toBe(2);
      expect(stats.by_action.validate).toBe(1);
      expect(stats.by_action.read).toBe(1);
    });

    it('should calculate average execution time', () => {
      const stats = getAuditStats();
      expect(stats.avg_execution_time_ms).toBe(50); // (100 + 50 + 30 + 20) / 4
    });

    it('should filter stats by tenant', () => {
      const stats = getAuditStats('tenant-a');
      expect(stats.total_entries).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
    });

    it('should return 1.0 success rate for empty log', () => {
      clearAuditLog();
      const stats = getAuditStats();
      expect(stats.success_rate).toBe(1);
    });
  });

  describe('getActionType', () => {
    it('should identify write operations', () => {
      expect(getActionType('create_invoice')).toBe('write');
      expect(getActionType('create_contact')).toBe('write');
      expect(getActionType('update_invoice')).toBe('write');
      expect(getActionType('delete_contact')).toBe('write');
    });

    it('should identify validate operations', () => {
      expect(getActionType('validate_schema_match')).toBe('validate');
      expect(getActionType('introspect_enums')).toBe('validate');
    });

    it('should identify simulate operations', () => {
      expect(getActionType('simulate_network_conditions')).toBe('simulate');
      expect(getActionType('dry_run_sync')).toBe('simulate');
      expect(getActionType('replay_idempotency')).toBe('simulate');
      expect(getActionType('seed_sandbox_data')).toBe('simulate');
    });

    it('should default to read for other operations', () => {
      expect(getActionType('get_mcp_capabilities')).toBe('read');
      expect(getActionType('switch_tenant_context')).toBe('read');
      expect(getActionType('get_audit_log')).toBe('read');
    });
  });

  describe('clearAuditLog', () => {
    it('should remove all entries', () => {
      logAudit({
        tenant_id: 'tenant-a',
        tool_name: 'test',
        action_type: 'read',
        success: true,
        request_id: 'req-1',
        execution_time_ms: 10,
      });

      expect(getAuditLogSize()).toBe(1);

      clearAuditLog();

      expect(getAuditLogSize()).toBe(0);
    });
  });
});
