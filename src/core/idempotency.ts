import { getDatabase } from './db/index.js';

/**
 * Idempotency Store
 *
 * Provides database-backed storage for idempotency keys to prevent
 * duplicate operations across server restarts and per-tenant isolation.
 */

export interface IdempotencyEntry {
  tenant_id: string;
  idempotency_key: string;
  result_data: unknown; // The stored result (will be JSON serialized)
  entity_type: string;
  expires_at?: number;
}

/**
 * Store an idempotency key with its result.
 * Returns true if the key was newly stored, false if it already existed.
 */
export function storeIdempotency(entry: IdempotencyEntry): boolean {
  const db = getDatabase();

  // First check if key already exists
  const existing = db.prepare(
    'SELECT result_data FROM idempotency_store WHERE tenant_id = ? AND idempotency_key = ?'
  ).get(entry.tenant_id, entry.idempotency_key) as { result_data: string } | undefined;

  if (existing) {
    return false; // Key already exists
  }

  // Insert new entry
  db.prepare(
    `INSERT INTO idempotency_store (tenant_id, idempotency_key, result_data, entity_type, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    entry.tenant_id,
    entry.idempotency_key,
    JSON.stringify(entry.result_data),
    entry.entity_type,
    entry.expires_at ?? null
  );

  return true; // Key was newly stored
}

/**
 * Retrieve an idempotency entry by key.
 * Returns the stored result data, or undefined if not found/expired.
 */
export function getIdempotency(tenantId: string, key: string): unknown | undefined {
  const db = getDatabase();

  const row = db.prepare(
    `SELECT result_data, expires_at FROM idempotency_store
     WHERE tenant_id = ? AND idempotency_key = ?`
  ).get(tenantId, key) as { result_data: string; expires_at: number | null } | undefined;

  if (!row) {
    return undefined;
  }

  // Check expiration
  if (row.expires_at && row.expires_at < Date.now() / 1000) {
    // Expired, delete and return undefined
    deleteIdempotency(tenantId, key);
    return undefined;
  }

  return JSON.parse(row.result_data);
}

/**
 * Delete an idempotency entry.
 */
export function deleteIdempotency(tenantId: string, key: string): void {
  const db = getDatabase();
  db.prepare(
    'DELETE FROM idempotency_store WHERE tenant_id = ? AND idempotency_key = ?'
  ).run(tenantId, key);
}

/**
 * Clear expired idempotency entries.
 * Returns the number of entries deleted.
 */
export function clearExpiredIdempotency(): number {
  const db = getDatabase();
  const result = db.prepare(
    'DELETE FROM idempotency_store WHERE expires_at IS NOT NULL AND expires_at < ?'
  ).run(Date.now() / 1000);

  return result.changes;
}

/**
 * Clear all idempotency entries for a tenant.
 */
export function clearTenantIdempotency(tenantId: string): void {
  const db = getDatabase();
  db.prepare(
    'DELETE FROM idempotency_store WHERE tenant_id = ?'
  ).run(tenantId);
}

/**
 * Get idempotency statistics for a tenant.
 */
export function getIdempotencyStats(tenantId?: string): {
  total_entries: number;
  by_entity_type: Record<string, number>;
} {
  const db = getDatabase();

  let rows: { entity_type: string; count: number }[];
  if (tenantId) {
    rows = db.prepare(
      `SELECT entity_type, COUNT(*) as count FROM idempotency_store
       WHERE tenant_id = ? GROUP BY entity_type`
    ).all(tenantId) as { entity_type: string; count: number }[];
  } else {
    rows = db.prepare(
      `SELECT entity_type, COUNT(*) as count FROM idempotency_store GROUP BY entity_type`
    ).all() as { entity_type: string; count: number }[];
  }

  const by_entity_type: Record<string, number> = {};
  let total_entries = 0;
  for (const row of rows) {
    by_entity_type[row.entity_type] = row.count;
    total_entries += row.count;
  }

  return { total_entries, by_entity_type };
}
