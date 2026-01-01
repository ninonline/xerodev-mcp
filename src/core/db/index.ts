import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/**
 * Initialises the SQLite database connection.
 * Creates the database file and schema if they don't exist.
 */
export function initDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? process.env.MCP_DATABASE_PATH ?? './data/xerodev.db';

  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create database connection
  db = new Database(path);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema migrations
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Execute schema (CREATE IF NOT EXISTS is idempotent)
  db.exec(schema);

  return db;
}

/**
 * Returns the database instance, initialising if needed.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Closes the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Types for database operations

export interface TenantRow {
  id: number;
  tenant_id: string;
  tenant_name: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  granted_scopes: string;
  xero_region: string | null;
  created_at: number;
  last_synced_at: number | null;
  connection_status: 'active' | 'expired' | 'revoked';
}

export interface ShadowStateRow {
  id: number;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  entity_data: string;
  account_code: string | null;
  account_type: string | null;
  tax_type: string | null;
  status: string | null;
  cached_at: number;
}

/**
 * Prepared statements for common operations.
 */
export function createStatements(database: Database.Database): {
  getTenant: Database.Statement<[string], TenantRow>;
  getAllTenants: Database.Statement<[], TenantRow>;
  getAllTenantsIncludingInactive: Database.Statement<[], TenantRow>;
  insertTenant: Database.Statement;
  updateTenantTokens: Database.Statement;
  updateTenantStatus: Database.Statement;
  updateLastSynced: Database.Statement;
  deleteTenant: Database.Statement;
  getShadowState: Database.Statement<[string, string], ShadowStateRow>;
  getShadowStateByCode: Database.Statement<[string, string], ShadowStateRow>;
  upsertShadowState: Database.Statement;
  insertAuditLog: Database.Statement;
} {
  return {
    // Tenant operations
    getTenant: database.prepare<[string], TenantRow>(
      'SELECT * FROM tenants WHERE tenant_id = ?'
    ),
    getAllTenants: database.prepare<[], TenantRow>(
      'SELECT * FROM tenants WHERE connection_status = \'active\''
    ),
    getAllTenantsIncludingInactive: database.prepare<[], TenantRow>(
      'SELECT * FROM tenants'
    ),
    insertTenant: database.prepare(
      `INSERT INTO tenants (tenant_id, tenant_name, access_token, refresh_token, token_expires_at, granted_scopes, xero_region, connection_status)
       VALUES (@tenant_id, @tenant_name, @access_token, @refresh_token, @token_expires_at, @granted_scopes, @xero_region, @connection_status)`
    ),
    updateTenantTokens: database.prepare(
      `UPDATE tenants
       SET access_token = @access_token,
           refresh_token = @refresh_token,
           token_expires_at = @token_expires_at,
           last_synced_at = strftime('%s', 'now')
       WHERE tenant_id = @tenant_id`
    ),
    updateTenantStatus: database.prepare(
      `UPDATE tenants
       SET connection_status = @connection_status,
           last_synced_at = strftime('%s', 'now')
       WHERE tenant_id = @tenant_id`
    ),
    updateLastSynced: database.prepare(
      `UPDATE tenants
       SET last_synced_at = strftime('%s', 'now')
       WHERE tenant_id = @tenant_id`
    ),
    deleteTenant: database.prepare(
      `DELETE FROM tenants WHERE tenant_id = @tenant_id`
    ),

    // Shadow state operations
    getShadowState: database.prepare<[string, string], ShadowStateRow>(
      'SELECT * FROM shadow_state WHERE tenant_id = ? AND entity_type = ?'
    ),
    getShadowStateByCode: database.prepare<[string, string], ShadowStateRow>(
      'SELECT * FROM shadow_state WHERE tenant_id = ? AND account_code = ?'
    ),
    upsertShadowState: database.prepare(
      `INSERT INTO shadow_state (tenant_id, entity_type, entity_id, entity_data, account_code, account_type, tax_type, status)
       VALUES (@tenant_id, @entity_type, @entity_id, @entity_data, @account_code, @account_type, @tax_type, @status)
       ON CONFLICT(tenant_id, entity_type, entity_id) DO UPDATE SET
         entity_data = excluded.entity_data,
         account_code = excluded.account_code,
         account_type = excluded.account_type,
         tax_type = excluded.tax_type,
         status = excluded.status,
         cached_at = strftime('%s', 'now')`
    ),

    // Audit log
    insertAuditLog: database.prepare(
      `INSERT INTO audit_log (tenant_id, tool_name, action_type, success, error_message, request_id)
       VALUES (@tenant_id, @tool_name, @action_type, @success, @error_message, @request_id)`
    ),
  };
}
