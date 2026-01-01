-- ============================================================================
-- XERO INTEGRATION FOUNDRY - SQLite Schema
-- Version: 0.1.0
-- Security Level: High (contains encrypted OAuth tokens)
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================================
-- TENANTS TABLE
-- Stores Xero organisation connections with encrypted tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id           TEXT NOT NULL UNIQUE,
    tenant_name         TEXT,

    -- OAuth Tokens (ENCRYPTED at rest using AES-256-GCM)
    access_token        TEXT NOT NULL,
    refresh_token       TEXT NOT NULL,
    token_expires_at    INTEGER NOT NULL,

    -- Scopes granted (JSON array)
    granted_scopes      TEXT NOT NULL,

    -- Tenant metadata
    xero_region         TEXT,

    -- Timestamps
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_synced_at      INTEGER,

    -- Connection health
    connection_status   TEXT DEFAULT 'active',

    CHECK (connection_status IN ('active', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(connection_status);

-- ============================================================================
-- SHADOW_STATE TABLE
-- Caches tenant-specific Chart of Accounts, Tax Rates, Contacts, etc.
-- Enables offline validation and dry-run simulations
-- ============================================================================
CREATE TABLE IF NOT EXISTS shadow_state (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id           TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

    -- Entity identification
    entity_type         TEXT NOT NULL,
    entity_id           TEXT NOT NULL,

    -- Full entity data (JSON)
    entity_data         TEXT NOT NULL,

    -- Indexed fields for fast lookups
    account_code        TEXT,
    account_type        TEXT,
    tax_type            TEXT,
    status              TEXT,

    -- Cache management
    cached_at           INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    UNIQUE(tenant_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_shadow_tenant ON shadow_state(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_shadow_account_code ON shadow_state(tenant_id, account_code) WHERE account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shadow_tax_type ON shadow_state(tenant_id, tax_type) WHERE tax_type IS NOT NULL;

-- ============================================================================
-- AUDIT_LOG TABLE
-- Security audit trail for tool invocations
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Context
    tenant_id           TEXT REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    tool_name           TEXT NOT NULL,

    -- Action details
    action_type         TEXT NOT NULL,

    -- Outcome
    success             INTEGER NOT NULL,
    error_message       TEXT,

    -- Correlation
    request_id          TEXT NOT NULL,

    -- Timing
    timestamp           INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    CHECK (action_type IN ('read', 'write', 'delete', 'validate', 'auth'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_log(request_id);

-- ============================================================================
-- IDEMPOTENCY_STORE TABLE
-- Prevents duplicate operations when retrying with same idempotency key
-- ============================================================================
CREATE TABLE IF NOT EXISTS idempotency_store (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Key and tenant
    tenant_id           TEXT NOT NULL,
    idempotency_key     TEXT NOT NULL,

    -- The stored result (JSON)
    result_data         TEXT NOT NULL,

    -- Metadata
    entity_type         TEXT NOT NULL,  -- 'Invoice', 'Contact', etc.
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at          INTEGER,        -- Optional expiration

    UNIQUE(tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotent_lookup ON idempotency_store(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotent_expiry ON idempotency_store(expires_at) WHERE expires_at IS NOT NULL;
