# CLAUDE.md - Implementation Guide for Claude Code

> This file contains instructions for Claude Code (AI coding assistant) to effectively implement and maintain the Xero Integration Foundry MCP server.

---

## 🎯 Project Overview

**What we're building:** An MCP server that helps SaaS developers build, test, and validate Xero integrations WITHOUT requiring live Xero credentials.

**Primary users:** AI coding agents (like you, Claude) and human developers.

**Core philosophy:**
1. **Mocks first, code second** - Test fixtures before implementation
2. **Docker-native** - Everything runs in containers
3. **AI-optimized** - Tool descriptions guide agents through workflows
4. **Educational errors** - Every failure teaches how to fix it

**NOT a clone of the official Xero MCP.** The official MCP is for AI assistants querying live Xero data. This is for developers testing integrations.

---

## 📁 Project Structure

IMPORTANT: this project will be open-sourced on a public github repo. You MUST take care of the following with every action:
1. Put internal documentation, like plans, explainers, buildlogs, and other text documentation generated for internal and development use into the `/.devdocs` directory.
2. Keep the .gitignore updated so that we do not inadvertently commit and merge internal files or secrets.
3. All public documentation including README.md files and documentation in /docs directory must be written in English UK. In plain English. Using paragraphs and lists where and when appropriate. Using standard github-compatible markdown lint.

---

## 📚 Internal Planning Documents

**Location:** `/.devdocs`

This directory contains internal planning documents, proposals, and development notes that inform implementation decisions. These documents are not intended for public release but provide valuable context for developers working on the project.

```
.devdocs/
├── proposals/
│   ├── foundry-vs-official-mcp-comparison.md   # How this differs from official Xero MCP
│   ├── implementation-guide-critical-components.md
│   └── massively-improved-development-plan.md
└── [future: buildlogs/, decisions/, etc.]
```

**When to consult .devdocs:**
- Before making architectural decisions
- When unclear about project direction or philosophy
- To understand why certain design choices were made
- For detailed implementation rationale beyond this CLAUDE.md

---

```
xerodev-mcp/
│
├── src/
│   ├── index.ts                      # Server entrypoint
│   │
│   ├── core/
│   │   ├── security.ts               # AES-256-GCM encryption for tokens
│   │   ├── mcp-response.ts           # Universal response protocol (4 verbosity levels)
│   │   ├── schema-validator.ts       # THE KILLER FEATURE - diff engine
│   │   └── db/
│   │       ├── schema.sql            # SQLite schema (multi-tenant)
│   │       ├── index.ts              # Database connection
│   │       └── seed-runner.ts        # Loads fixtures into SQLite
│   │
│   ├── adapters/
│   │   ├── adapter-interface.ts      # Common interface for all adapters
│   │   ├── xero-mock-adapter.ts      # Returns data from test/fixtures
│   │   ├── xero-live-adapter.ts      # Real xero-node SDK calls
│   │   └── adapter-factory.ts        # Creates adapter based on MCP_MODE
│   │
│   ├── tools/
│   │   ├── core/
│   │   │   ├── get-capabilities.ts   # AI agent instructions (call first)
│   │   │   ├── diagnose-connection.ts
│   │   │   └── switch-tenant.ts
│   │   │
│   │   ├── validation/
│   │   │   ├── validate-schema.ts    # Schema validation with diff
│   │   │   ├── introspect-enums.ts   # Get valid field values
│   │   │   └── check-references.ts   # Verify IDs exist
│   │   │
│   │   ├── simulation/
│   │   │   ├── dry-run.ts            # Simulate batch operations
│   │   │   ├── seed-sandbox.ts       # Generate test data
│   │   │   └── drive-lifecycle.ts    # Invoice state machine
│   │   │
│   │   ├── chaos/
│   │   │   ├── simulate-network.ts   # Inject 429s, 500s
│   │   │   └── replay-idempotency.ts
│   │   │
│   │   └── crud/                     # Standard Xero operations
│   │       ├── contacts.ts
│   │       ├── invoices.ts
│   │       └── payments.ts
│   │
│   └── ai-context/
│       ├── tool-descriptions.ts      # Enhanced descriptions per AI model
│       └── error-templates.ts        # Educational error generators
│
├── test/
│   ├── fixtures/                     # CRITICAL: Build this FIRST
│   │   ├── tenants/
│   │   │   ├── au-acme-gst.json     # Australian tenant with GST
│   │   │   ├── us-startup.json      # US tenant, no sales tax
│   │   │   └── uk-ltd-vat.json      # UK tenant with VAT
│   │   ├── invoices/
│   │   │   ├── valid-batch.json     # 50 valid invoices
│   │   │   ├── overdue.json         # Past-due scenarios
│   │   │   └── invalid-codes.json   # For testing validation
│   │   ├── contacts/
│   │   └── accounts/                 # Chart of Accounts per region
│   │
│   ├── scenarios/                    # AI agent test flows (YAML)
│   │   ├── happy-path.yml
│   │   └── recovery-flow.yml
│   │
│   ├── unit/                         # Unit tests
│   └── integration/                  # Integration tests against mocks
│
├── docker/
│   ├── Dockerfile.dev                # Hot-reload for development
│   └── Dockerfile.prod               # Multi-stage production build
│
├── scripts/
│   ├── generate-fixtures.ts          # faker.js fixture generator
│   └── validate-fixtures.ts          # Validate against OpenAPI spec
│
├── docker-compose.yml                # Default: mock mode
├── docker-compose.live.yml           # Override for real Xero
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 🔧 Implementation Order

**CRITICAL: Follow this order. Do not skip steps.**

### Phase 1: Foundation (Do First)

#### Step 1.1: Test Fixtures
**Location:** `test/fixtures/`

Create realistic test data BEFORE writing any TypeScript:

```json
// test/fixtures/tenants/au-acme-gst.json
{
  "_meta": {
    "description": "Australian tenant with GST tax system",
    "region": "AU",
    "use_cases": ["Test GST calculations", "Test Australian tax types"]
  },
  "tenant_id": "acme-au-001",
  "xero_tenant_id": "mock-uuid-au-001",
  "org_name": "Acme Corporation Pty Ltd",
  "region": "AU",
  "currency": "AUD",
  "chart_of_accounts": [
    {
      "account_id": "acc-001",
      "code": "200",
      "name": "Sales",
      "type": "REVENUE",
      "tax_type": "OUTPUT",
      "status": "ACTIVE"
    },
    {
      "account_id": "acc-002", 
      "code": "310",
      "name": "Business Bank Account",
      "type": "BANK",
      "status": "ACTIVE"
    },
    {
      "account_id": "acc-003",
      "code": "999",
      "name": "Old Sales Account",
      "type": "REVENUE",
      "tax_type": "OUTPUT",
      "status": "ARCHIVED"
    }
  ],
  "tax_rates": [
    { "name": "GST on Income", "tax_type": "OUTPUT", "rate": 10.0, "status": "ACTIVE" },
    { "name": "GST on Expenses", "tax_type": "INPUT", "rate": 10.0, "status": "ACTIVE" },
    { "name": "GST Free Income", "tax_type": "EXEMPTOUTPUT", "rate": 0.0, "status": "ACTIVE" }
  ],
  "contacts": [
    { "contact_id": "contact-001", "name": "Example Customer", "email": "customer@example.com" },
    { "contact_id": "contact-002", "name": "Archived Supplier", "email": "old@example.com", "status": "ARCHIVED" }
  ]
}
```

**Generate invoices with faker.js:**

```typescript
// scripts/generate-fixtures.ts
import { faker } from '@faker-js/faker';
import * as fs from 'fs';

function generateInvoice(tenant: any): any {
  const contact = faker.helpers.arrayElement(tenant.contacts.filter((c: any) => c.status !== 'ARCHIVED'));
  const account = faker.helpers.arrayElement(tenant.chart_of_accounts.filter((a: any) => a.type === 'REVENUE' && a.status === 'ACTIVE'));
  
  return {
    InvoiceID: faker.string.uuid(),
    Type: 'ACCREC',
    Contact: { ContactID: contact.contact_id },
    Date: faker.date.past().toISOString().split('T')[0],
    DueDate: faker.date.future().toISOString().split('T')[0],
    Status: faker.helpers.arrayElement(['DRAFT', 'AUTHORISED']),
    LineAmountTypes: 'Exclusive',
    LineItems: [{
      Description: faker.commerce.productDescription(),
      Quantity: faker.number.int({ min: 1, max: 10 }),
      UnitAmount: parseFloat(faker.commerce.price({ min: 10, max: 1000 })),
      AccountCode: account.code,
      TaxType: account.tax_type
    }],
    CurrencyCode: tenant.currency
  };
}

// Generate 50 invoices per tenant
const tenant = JSON.parse(fs.readFileSync('test/fixtures/tenants/au-acme-gst.json', 'utf-8'));
const invoices = Array.from({ length: 50 }, () => generateInvoice(tenant));
fs.writeFileSync('test/fixtures/invoices/au-acme-batch.json', JSON.stringify(invoices, null, 2));
```

#### Step 1.2: Core Modules

**Location:** `src/core/`

##### security.ts
```typescript
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export class SecurityGuard {
  private key: Buffer;

  constructor() {
    const envKey = process.env.MCP_ENCRYPTION_KEY;
    if (!envKey || envKey.length !== 64) {
      throw new Error(
        'FATAL: MCP_ENCRYPTION_KEY must be a 64-character hex string.\n' +
        'Generate one with: openssl rand -hex 32'
      );
    }
    this.key = Buffer.from(envKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(payload: string): string {
    const [ivHex, authTagHex, encryptedHex] = payload.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Invalid encrypted payload format');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  getKeyFingerprint(): string {
    return createHash('sha256').update(this.key).digest('hex').substring(0, 16);
  }
}
```

##### mcp-response.ts
```typescript
import { randomUUID } from 'node:crypto';

export type VerbosityLevel = 'silent' | 'compact' | 'diagnostic' | 'debug';

export interface MCPResponse<T = any> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    request_id: string;
    execution_time_ms?: number;
    score?: number;
  };
  diagnostics?: {
    narrative: string;
    warnings?: string[];
    root_cause?: string;
  };
  debug?: {
    logs?: string[];
    sql_queries?: string[];
  };
  recovery?: {
    suggested_action_id: string;
    description?: string;
    next_tool_call?: {
      name: string;
      arguments: Record<string, any>;
    };
  };
}

export function createResponse<T>(
  data: T,
  options: {
    success: boolean;
    verbosity?: VerbosityLevel;
    narrative?: string;
    warnings?: string[];
    root_cause?: string;
    score?: number;
    recovery?: MCPResponse['recovery'];
    executionTimeMs?: number;
  }
): MCPResponse<T> {
  const { success, verbosity = 'compact', narrative, warnings, root_cause, score, recovery, executionTimeMs } = options;

  const response: MCPResponse<T> = { success, data };

  if (verbosity !== 'silent') {
    response.meta = {
      timestamp: new Date().toISOString(),
      request_id: randomUUID(),
      execution_time_ms: executionTimeMs,
      score: score ?? (success ? 1.0 : 0.0),
    };
  }

  if (verbosity === 'diagnostic' || verbosity === 'debug') {
    response.diagnostics = {
      narrative: narrative || (success ? 'Operation completed successfully.' : 'Operation failed.'),
      warnings: warnings || [],
      root_cause,
    };
    if (recovery) {
      response.recovery = recovery;
    }
  }

  return response;
}
```

##### db/schema.sql
```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL UNIQUE,
    tenant_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at INTEGER NOT NULL,
    granted_scopes TEXT NOT NULL,
    xero_region TEXT,
    connection_status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_synced_at INTEGER,
    CHECK (connection_status IN ('active', 'expired', 'revoked'))
);

CREATE TABLE IF NOT EXISTS shadow_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_data TEXT NOT NULL,
    account_code TEXT,
    account_type TEXT,
    tax_type TEXT,
    status TEXT,
    cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(tenant_id, entity_type, entity_id)
);

CREATE INDEX idx_shadow_tenant ON shadow_state(tenant_id, entity_type);
CREATE INDEX idx_shadow_account_code ON shadow_state(tenant_id, account_code) WHERE account_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,
    tool_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    success INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
```

#### Step 1.3: Adapter Layer

**Location:** `src/adapters/`

##### adapter-interface.ts
```typescript
export interface Invoice {
  InvoiceID: string;
  Type: 'ACCREC' | 'ACCPAY';
  Contact: { ContactID: string };
  LineItems: LineItem[];
  Status?: string;
  // ... other Xero fields
}

export interface XeroAdapter {
  // Read operations
  getInvoices(tenantId: string, filter?: InvoiceFilter): Promise<Invoice[]>;
  getContacts(tenantId: string, filter?: ContactFilter): Promise<Contact[]>;
  getAccounts(tenantId: string): Promise<Account[]>;
  getTaxRates(tenantId: string): Promise<TaxRate[]>;
  
  // Write operations
  createInvoice(tenantId: string, invoice: InvoicePayload): Promise<CreateResult>;
  createContact(tenantId: string, contact: ContactPayload): Promise<CreateResult>;
  
  // Validation (mock returns immediately, live calls Xero)
  validatePayload(tenantId: string, entityType: string, payload: any): Promise<ValidationResult>;
}
```

##### xero-mock-adapter.ts
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { XeroAdapter, Invoice } from './adapter-interface';

export class XeroMockAdapter implements XeroAdapter {
  private fixtures: Map<string, any> = new Map();
  
  constructor() {
    this.loadFixtures();
  }
  
  private loadFixtures() {
    const fixturesDir = path.join(process.cwd(), 'test', 'fixtures');
    
    // Load tenants
    const tenantsDir = path.join(fixturesDir, 'tenants');
    for (const file of fs.readdirSync(tenantsDir)) {
      const tenant = JSON.parse(fs.readFileSync(path.join(tenantsDir, file), 'utf-8'));
      this.fixtures.set(`tenant:${tenant.tenant_id}`, tenant);
    }
    
    // Load invoices per tenant
    const invoicesDir = path.join(fixturesDir, 'invoices');
    for (const file of fs.readdirSync(invoicesDir)) {
      const tenantId = file.replace('.json', '').split('-')[0]; // e.g., "au-acme-batch.json" -> "au"
      const invoices = JSON.parse(fs.readFileSync(path.join(invoicesDir, file), 'utf-8'));
      this.fixtures.set(`invoices:${tenantId}`, invoices);
    }
  }
  
  async getInvoices(tenantId: string, filter?: any): Promise<Invoice[]> {
    const invoices = this.fixtures.get(`invoices:${tenantId}`) || [];
    // Apply filters...
    return invoices;
  }
  
  async getAccounts(tenantId: string): Promise<Account[]> {
    const tenant = this.fixtures.get(`tenant:${tenantId}`);
    return tenant?.chart_of_accounts || [];
  }
  
  async validatePayload(tenantId: string, entityType: string, payload: any): Promise<ValidationResult> {
    const tenant = this.fixtures.get(`tenant:${tenantId}`);
    if (!tenant) {
      return { valid: false, errors: [`Tenant ${tenantId} not found`] };
    }
    
    // Validate against tenant's Chart of Accounts
    if (entityType === 'Invoice') {
      return this.validateInvoice(payload, tenant);
    }
    
    return { valid: true, errors: [] };
  }
  
  private validateInvoice(invoice: any, tenant: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    for (const [i, line] of (invoice.LineItems || []).entries()) {
      // Check AccountCode exists and is active
      const account = tenant.chart_of_accounts.find((a: any) => a.code === line.AccountCode);
      if (!account) {
        errors.push(`LineItems[${i}].AccountCode '${line.AccountCode}' does not exist in tenant's Chart of Accounts`);
      } else if (account.status === 'ARCHIVED') {
        errors.push(`LineItems[${i}].AccountCode '${line.AccountCode}' is ARCHIVED`);
      }
      
      // Check TaxType is valid for region
      const taxRate = tenant.tax_rates.find((t: any) => t.tax_type === line.TaxType);
      if (line.TaxType && !taxRate) {
        errors.push(`LineItems[${i}].TaxType '${line.TaxType}' is not valid for ${tenant.region} region`);
      }
    }
    
    // Check ContactID exists
    const contact = tenant.contacts.find((c: any) => c.contact_id === invoice.Contact?.ContactID);
    if (!contact) {
      errors.push(`Contact.ContactID '${invoice.Contact?.ContactID}' not found`);
    } else if (contact.status === 'ARCHIVED') {
      warnings.push(`Contact '${contact.name}' is ARCHIVED - invoice may fail`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: errors.length === 0 ? 1.0 : Math.max(0, 1 - (errors.length * 0.2))
    };
  }
}
```

##### adapter-factory.ts
```typescript
import { XeroAdapter } from './adapter-interface';
import { XeroMockAdapter } from './xero-mock-adapter';
import { XeroLiveAdapter } from './xero-live-adapter';

export class AdapterFactory {
  static create(mode: string = process.env.MCP_MODE || 'mock'): XeroAdapter {
    switch (mode) {
      case 'mock':
        console.log('🎭 Using MOCK adapter (no Xero API calls)');
        return new XeroMockAdapter();
      case 'live':
        console.log('🔴 Using LIVE adapter (real Xero API)');
        return new XeroLiveAdapter();
      default:
        throw new Error(`Unknown MCP_MODE: ${mode}. Use 'mock' or 'live'.`);
    }
  }
}
```

### Phase 2: Tools Implementation

#### Step 2.1: get-capabilities.ts (Implement First)

This tool tells AI agents how to use the server. **Every AI conversation should start with this.**

```typescript
// src/tools/core/get-capabilities.ts
import { z } from 'zod';
import { createResponse } from '../../core/mcp-response';

export const GetCapabilitiesSchema = {
  name: 'get_mcp_capabilities',
  description: `Returns server capabilities and AI agent guidelines.
  
**ALWAYS CALL THIS FIRST** before any other tool.

This tool returns:
- Current server mode (mock or live)
- Available tenants and their regions
- Required workflow for AI agents
- Rate limit information`,
  
  parameters: z.object({
    include_tenants: z.boolean().default(true).describe('Include list of available tenants')
  })
};

export async function handleGetCapabilities(args: any, adapter: XeroAdapter) {
  const mode = process.env.MCP_MODE || 'mock';
  
  const capabilities = {
    server: {
      name: 'xero-integration-foundry',
      version: '0.1.0',
      mode,
    },
    
    guidelines: {
      workflow: [
        '1. Call get_mcp_capabilities (this tool) to understand the server',
        '2. Call switch_tenant_context to select a tenant',
        '3. Call validate_schema_match BEFORE any write operation',
        '4. Call dry_run_sync to simulate batch operations',
        '5. If validation passes, call the actual write operation'
      ],
      rules: [
        'Always use idempotency_key for write operations to prevent duplicates',
        'Check recovery.next_tool_call in error responses for suggested fixes',
        'Use verbosity="diagnostic" when debugging issues'
      ]
    },
    
    available_tenants: args.include_tenants ? [
      { id: 'acme-au-001', region: 'AU', description: 'Australian tenant with GST' },
      { id: 'startup-us-001', region: 'US', description: 'US tenant, no sales tax' },
      { id: 'company-uk-001', region: 'UK', description: 'UK tenant with VAT' }
    ] : undefined,
    
    rate_limits: {
      mode: mode === 'mock' ? 'unlimited' : '60 requests/minute (Xero limit)',
      backoff_enabled: true
    },
    
    data_persistence: mode === 'mock' 
      ? 'Data stored in Docker volume. Persists across restarts if volume is mapped.'
      : 'Data stored in real Xero. Changes are permanent.'
  };

  return createResponse(capabilities, {
    success: true,
    verbosity: 'diagnostic',
    narrative: `Server running in ${mode.toUpperCase()} mode. ${
      mode === 'mock' 
        ? 'You can safely test without affecting real data.' 
        : 'WARNING: Operations will affect real Xero data.'
    } Follow the workflow in guidelines.workflow for best results.`
  });
}
```

#### Step 2.2: validate-schema.ts (The Killer Feature)

```typescript
// src/tools/validation/validate-schema.ts
import { z } from 'zod';
import { createResponse } from '../../core/mcp-response';
import { XeroAdapter } from '../../adapters/adapter-interface';

export const ValidateSchemaSchema = {
  name: 'validate_schema_match',
  description: `Validates a payload against Xero's schema AND the tenant's specific configuration.

**This is the most important tool.** Call it before any write operation.

Returns:
- Structural validation (JSON schema compliance)
- Context validation (AccountCodes exist, TaxTypes valid for region)
- Compliance score (0.0 to 1.0)
- Detailed diff showing what's wrong
- Recovery suggestions with next_tool_call

Example flow:
1. Developer submits invoice payload
2. This tool finds AccountCode '999' is ARCHIVED
3. Returns recovery.next_tool_call pointing to introspect_enums
4. AI agent calls introspect_enums to find valid codes
5. AI agent fixes the payload and validates again`,

  parameters: z.object({
    tenant_id: z.string().describe('Target tenant ID'),
    entity_type: z.enum(['Invoice', 'Contact', 'Payment']).describe('Type of entity to validate'),
    payload: z.any().describe('The payload to validate'),
    verbosity: z.enum(['compact', 'diagnostic', 'debug']).default('diagnostic')
  })
};

export async function handleValidateSchema(args: any, adapter: XeroAdapter) {
  const { tenant_id, entity_type, payload, verbosity } = args;
  const startTime = Date.now();
  
  // Validate using adapter (mock reads from fixtures, live calls Xero)
  const result = await adapter.validatePayload(tenant_id, entity_type, payload);
  
  const executionTimeMs = Date.now() - startTime;
  
  if (result.valid) {
    return createResponse({
      valid: true,
      entity_type,
      score: result.score || 1.0
    }, {
      success: true,
      verbosity,
      score: result.score,
      narrative: `${entity_type} payload is valid for tenant ${tenant_id}. Safe to proceed with creation.`,
      executionTimeMs
    });
  }
  
  // Build detailed diff for failures
  const diff = result.errors.map(error => {
    const match = error.match(/(\w+)\[(\d+)\]\.(\w+)/);
    if (match) {
      return {
        field: `${match[1]}[${match[2]}].${match[3]}`,
        issue: error,
        severity: 'error' as const
      };
    }
    return { field: 'unknown', issue: error, severity: 'error' as const };
  });
  
  // Determine recovery action
  let recovery: any = undefined;
  if (result.errors.some(e => e.includes('AccountCode'))) {
    recovery = {
      suggested_action_id: 'find_valid_account_codes',
      description: 'Search for valid account codes in the tenant Chart of Accounts',
      next_tool_call: {
        name: 'introspect_enums',
        arguments: {
          tenant_id,
          entity_type: 'Account',
          filter: { status: 'ACTIVE' }
        }
      }
    };
  } else if (result.errors.some(e => e.includes('TaxType'))) {
    recovery = {
      suggested_action_id: 'find_valid_tax_types',
      description: 'Get valid tax types for this tenant region',
      next_tool_call: {
        name: 'introspect_enums',
        arguments: {
          tenant_id,
          entity_type: 'TaxRate',
          filter: { status: 'ACTIVE' }
        }
      }
    };
  } else if (result.errors.some(e => e.includes('ContactID'))) {
    recovery = {
      suggested_action_id: 'find_or_create_contact',
      description: 'Search for existing contacts or create a new one',
      next_tool_call: {
        name: 'list_contacts',
        arguments: { tenant_id }
      }
    };
  }
  
  return createResponse({
    valid: false,
    entity_type,
    score: result.score || 0,
    diff
  }, {
    success: false,
    verbosity,
    score: result.score,
    narrative: `${entity_type} validation failed with ${result.errors.length} error(s). ` +
      `Most common issue: ${result.errors[0]}. ` +
      `See recovery.next_tool_call for suggested fix.`,
    warnings: result.warnings,
    recovery,
    executionTimeMs
  });
}
```

#### Step 2.3: seed-sandbox.ts

```typescript
// src/tools/simulation/seed-sandbox.ts
import { faker } from '@faker-js/faker';
import { z } from 'zod';
import { createResponse } from '../../core/mcp-response';

export const SeedSandboxSchema = {
  name: 'seed_sandbox_data',
  description: `Generates realistic test data into the sandbox.

Use this when you need specific test scenarios:
- OVERDUE_BILLS: Invoices 30-90 days past due
- FOREIGN_CURRENCY: Mix of USD, EUR, GBP invoices
- INCOMPLETE_DATA: Contacts missing required fields
- CHAOS: Random edge cases for stress testing

The generated data is immediately available for testing.
Returns sample IDs you can use in subsequent tool calls.`,

  parameters: z.object({
    tenant_id: z.string(),
    entity: z.enum(['CONTACTS', 'INVOICES', 'FULL_TENANT']),
    count: z.number().max(100).default(10),
    scenario: z.enum(['DEFAULT', 'OVERDUE_BILLS', 'FOREIGN_CURRENCY', 'INCOMPLETE_DATA', 'CHAOS']).default('DEFAULT')
  })
};

export async function handleSeedSandbox(args: any, db: Database) {
  const { tenant_id, entity, count, scenario } = args;
  const generatedIds: string[] = [];
  
  // Implementation generates and stores data...
  // (See full implementation in previous messages)
  
  return createResponse({
    generated_count: count,
    entity_type: entity,
    scenario,
    sample_ids: generatedIds.slice(0, 5)
  }, {
    success: true,
    verbosity: 'diagnostic',
    narrative: `Generated ${count} ${entity} with scenario '${scenario}'. ` +
      `Sample IDs: ${generatedIds.slice(0, 3).join(', ')}. ` +
      `Use these IDs in subsequent tool calls.`
  });
}
```

---

## 🚨 Critical Implementation Rules

### Rule 1: Every Tool Must Have Educational Errors

**Bad:**
```typescript
if (!account) {
  throw new Error('Invalid account code');
}
```

**Good:**
```typescript
if (!account) {
  return createResponse({ valid: false }, {
    success: false,
    verbosity: 'diagnostic',
    narrative: `AccountCode '${code}' not found in tenant's Chart of Accounts. ` +
      `This ${tenant.region} tenant may use different account codes than expected.`,
    recovery: {
      suggested_action_id: 'find_valid_accounts',
      next_tool_call: {
        name: 'introspect_enums',
        arguments: { tenant_id, entity_type: 'Account' }
      }
    }
  });
}
```

### Rule 2: Tool Descriptions Must Guide AI Workflow

**Bad:**
```typescript
description: "Creates an invoice"
```

**Good:**
```typescript
description: `Creates a DRAFT invoice in Xero.

**PREREQUISITES** (call these first):
1. Verify ContactID exists: use list_contacts or create_contact
2. Validate payload: use validate_schema_match
3. (Optional) Dry-run: use dry_run_sync

**COMMON FAILURES:**
- AccountCode not found → Call introspect_enums
- Invalid TaxType → AU uses OUTPUT/INPUT, US uses NONE
- Missing ContactID → Create contact first

**IDEMPOTENCY:**
Always include idempotency_key to prevent duplicates on retry.`
```

### Rule 3: Mock Adapter Must Behave Like Real Xero

The mock adapter should return the same response structure as real Xero, including:
- Same field names
- Same error formats
- Same validation rules

This ensures code works identically in mock and live modes.

### Rule 4: Test Fixtures Must Be Realistic

**Bad fixture:**
```json
{ "invoice_id": "1", "amount": 100 }
```

**Good fixture:**
```json
{
  "InvoiceID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "Type": "ACCREC",
  "Contact": {
    "ContactID": "contact-uuid-here",
    "Name": "Acme Corp"
  },
  "Date": "2025-01-15",
  "DueDate": "2025-02-15",
  "Status": "DRAFT",
  "LineAmountTypes": "Exclusive",
  "LineItems": [{
    "Description": "Consulting Services - January 2025",
    "Quantity": 10,
    "UnitAmount": 150.00,
    "AccountCode": "200",
    "TaxType": "OUTPUT"
  }],
  "CurrencyCode": "AUD",
  "SubTotal": 1500.00,
  "TotalTax": 150.00,
  "Total": 1650.00
}
```

### Rule 5: Always Return `recovery.next_tool_call` on Failure

When validation fails, tell the AI exactly what to do next:

```typescript
recovery: {
  suggested_action_id: 'find_valid_accounts',
  description: 'Search Chart of Accounts for valid REVENUE accounts',
  next_tool_call: {
    name: 'introspect_enums',
    arguments: {
      tenant_id: 'acme-au-001',
      entity_type: 'Account',
      filter: { type: 'REVENUE', status: 'ACTIVE' }
    }
  }
}
```

---

## 🧪 Testing Requirements

### Unit Tests (Required for Every Tool)

```typescript
// test/unit/tools/validate-schema.test.ts
import { describe, it, expect } from 'vitest';
import { handleValidateSchema } from '../../../src/tools/validation/validate-schema';
import { XeroMockAdapter } from '../../../src/adapters/xero-mock-adapter';

describe('validate_schema_match', () => {
  const adapter = new XeroMockAdapter();
  
  it('should pass valid invoice', async () => {
    const result = await handleValidateSchema({
      tenant_id: 'acme-au-001',
      entity_type: 'Invoice',
      payload: validInvoiceFixture,
      verbosity: 'diagnostic'
    }, adapter);
    
    expect(result.success).toBe(true);
    expect(result.data.score).toBe(1.0);
  });
  
  it('should fail invoice with archived AccountCode', async () => {
    const result = await handleValidateSchema({
      tenant_id: 'acme-au-001',
      entity_type: 'Invoice',
      payload: { ...validInvoiceFixture, LineItems: [{ ...validInvoiceFixture.LineItems[0], AccountCode: '999' }] },
      verbosity: 'diagnostic'
    }, adapter);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics?.narrative).toContain('ARCHIVED');
    expect(result.recovery?.next_tool_call?.name).toBe('introspect_enums');
  });
  
  it('should return recovery action for invalid TaxType', async () => {
    const result = await handleValidateSchema({
      tenant_id: 'acme-au-001',
      entity_type: 'Invoice',
      payload: { ...validInvoiceFixture, LineItems: [{ ...validInvoiceFixture.LineItems[0], TaxType: 'INVALID' }] },
      verbosity: 'diagnostic'
    }, adapter);
    
    expect(result.recovery?.next_tool_call?.name).toBe('introspect_enums');
    expect(result.recovery?.next_tool_call?.arguments.entity_type).toBe('TaxRate');
  });
});
```

### Integration Tests (Against Mock Fixtures)

```typescript
// test/integration/workflow.test.ts
import { describe, it, expect } from 'vitest';

describe('AI Agent Workflow', () => {
  it('should complete full validation workflow', async () => {
    // 1. Get capabilities
    const caps = await callTool('get_mcp_capabilities', {});
    expect(caps.data.available_tenants).toHaveLength(3);
    
    // 2. Validate a bad invoice
    const validation1 = await callTool('validate_schema_match', {
      tenant_id: 'acme-au-001',
      entity_type: 'Invoice',
      payload: badInvoice
    });
    expect(validation1.success).toBe(false);
    expect(validation1.recovery?.next_tool_call).toBeDefined();
    
    // 3. Follow recovery suggestion
    const enums = await callTool(
      validation1.recovery.next_tool_call.name,
      validation1.recovery.next_tool_call.arguments
    );
    expect(enums.data.values.length).toBeGreaterThan(0);
    
    // 4. Fix and revalidate
    const fixedInvoice = { ...badInvoice, LineItems: [{ ...badInvoice.LineItems[0], AccountCode: enums.data.values[0].code }] };
    const validation2 = await callTool('validate_schema_match', {
      tenant_id: 'acme-au-001',
      entity_type: 'Invoice',
      payload: fixedInvoice
    });
    expect(validation2.success).toBe(true);
  });
});
```

---

## 🐳 Docker Commands

### Development

```bash
# Start with hot-reload
docker compose up

# Rebuild after dependency changes
docker compose up --build

# View logs
docker compose logs -f xero-mcp

# Run tests in container
docker compose exec xero-mcp npm test
```

### Production

```bash
# Build production image
docker build -f docker/Dockerfile.prod -t xero-foundry:latest .

# Run with live Xero
docker compose -f docker-compose.yml -f docker-compose.live.yml up
```

---

## 📋 Implementation Checklist

Use this to track progress:

### Phase 1: Foundation
- [ ] Create test fixtures (3 tenants, 150 invoices, 50 contacts)
- [ ] Implement `src/core/security.ts`
- [ ] Implement `src/core/mcp-response.ts`
- [ ] Create SQLite schema
- [ ] Implement `XeroMockAdapter`
- [ ] Implement `AdapterFactory`
- [ ] Setup Docker with auto-seed
- [ ] Verify 30-second demo works

### Phase 2: Core Tools
- [ ] Implement `get_mcp_capabilities`
- [ ] Implement `validate_schema_match` (THE KILLER FEATURE)
- [ ] Implement `introspect_enums`
- [ ] Implement `switch_tenant_context`
- [ ] Implement `dry_run_sync`
- [ ] Write unit tests for all tools
- [ ] Write integration test for full workflow

### Phase 3: Advanced
- [ ] Implement `seed_sandbox_data` with faker.js
- [ ] Implement `simulate_network_conditions`
- [ ] Implement CRUD operations (contacts, invoices)
- [ ] Implement `XeroLiveAdapter` for real Xero
- [ ] Add audit logging
- [ ] Write documentation

---

## 🎯 Success Criteria

The implementation is complete when:

1. **30-Second Demo Works:**
   ```bash
   git clone && docker compose up
   # Shows: "✅ Loaded 3 tenants, 150 invoices"
   ```

2. **AI Agent Can Complete Workflow:**
   - Call `get_mcp_capabilities`
   - Validate a payload with intentional errors
   - Follow `recovery.next_tool_call` suggestions
   - Fix payload and validate successfully
   - Run dry-run simulation

3. **All Tests Pass:**
   ```bash
   npm test  # Unit tests
   npm run test:integration  # Workflow tests
   npm run validate:fixtures  # Fixture validation
   ```

4. **Error Messages Are Educational:**
   - Every error includes `narrative` explaining the issue
   - Every error includes `recovery.next_tool_call` with specific action
   - No generic "Bad Request" messages

---

## 🚫 Anti-Patterns to Avoid

1. **Don't** write code before fixtures exist
2. **Don't** use generic error messages
3. **Don't** skip the `recovery.next_tool_call` in error responses
4. **Don't** hardcode paths (use `process.cwd()` or env vars)
5. **Don't** expose secrets in responses
6. **Don't** break the mock/live adapter interface contract
7. **Don't** skip tests for "simple" tools

---

## 📞 When Stuck

If implementation is unclear:

1. Check `test/fixtures/` for expected data formats
2. Check `test/scenarios/` for expected workflows
3. Run existing tests to understand expected behavior
4. The mock adapter is the source of truth for response formats

---

## 🤖 Agent Skills System

This project uses a sophisticated agent skills system to maintain code quality, automate releases, and ensure security compliance.

### Critical: Voice and Standards

**Before using any skill, understand these non-negotiable rules:**

**NEVER:**
- Sign commits, PRs, or issues as Claude/AI/Assistant
- Use robotic language ("As per your request", "I have implemented")
- Add "Generated by AI" or similar phrases anywhere
- Write in a stilted, template-like style

**ALWAYS:**
- Write as the human developer - this is their project
- Use plain English, natural voice
- Be direct and specific
- Sound professional but approachable

See [VOICE-AND-STANDARDS.md](.claude/skills/VOICE-AND-STANDARDS.md) for complete guidelines.

### Skill Directory Structure

```
.claude/
└── skills/
    ├── VOICE-AND-STANDARDS.md   # Read first - global rules
    ├── git-discipline.md        # Commits, branches, GitHub Flow
    ├── issue-crafter.md         # Issue writing and structure
    ├── docs-guardian.md         # Documentation maintenance
    ├── qa-engineer.md           # Testing and QA
    ├── security-sentinel.md     # Security audits
    ├── release-conductor.md     # Version & release management
    ├── repo-steward.md          # GitHub repository management
    ├── ci-architect.md          # CI/CD pipelines
    └── fixture-artisan.md       # Test data generation
```

### Skill Quick Reference

| Skill | Primary Responsibility | Key CLI Tools |
|-------|----------------------|---------------|
| **git-discipline** | Commits, branches, GitHub Flow | `git commit`, `git checkout`, `git rebase` |
| **issue-crafter** | Issue writing, bug reports, features | `gh issue create`, `gh issue edit` |
| **docs-guardian** | README, /docs, API docs, badges | `typedoc`, `markdownlint` |
| **qa-engineer** | Tests, coverage | `vitest`, `npx vitest --coverage` |
| **security-sentinel** | Security audits, scanning | `npm audit`, `gitleaks` |
| **release-conductor** | Versions, CHANGELOG, npm publish | `npm version`, `gh release` |
| **repo-steward** | PRs, code review, labels | `gh pr`, `gh issue` |
| **ci-architect** | GitHub Actions workflows | `gh workflow`, `act` |
| **fixture-artisan** | Test fixture generation | `tsx scripts/generate-fixtures.ts` |

### Clear Ownership Boundaries

```
VERSION CONTROL
├── git-discipline: Commit messages, branches, atomic commits
├── repo-steward: PRs, code review, labels, milestones
└── release-conductor: Git tags, release commits

CONTENT WRITING
├── issue-crafter: Issue content, bug reports, feature requests
├── docs-guardian: README, /docs, API docs, badges
└── release-conductor: CHANGELOG.md only

TESTING
├── qa-engineer: Test files, vitest config
├── fixture-artisan: Test fixtures, generation scripts
└── security-sentinel: Security tests only

CI/CD
├── ci-architect: GitHub Actions workflows
└── release-conductor: Release workflow (co-owned)
```

### Success Metrics by Skill

| Skill | Key Metrics |
|-------|------------|
| git-discipline | Atomic commits, 20-40 word messages, no AI attribution |
| issue-crafter | Clear titles, actionable content, proper labels |
| docs-guardian | 0 broken links, API docs current |
| qa-engineer | >90% coverage, 0 flaky tests |
| security-sentinel | `npm audit` clean, `gitleaks` clean |
| release-conductor | SemVer correct, CHANGELOG current |
| repo-steward | <24hr response, PRs merged <3 days |
| ci-architect | <5min CI time |
| fixture-artisan | All fixtures validate |

---

*This document is optimized for Claude Code. Follow the implementation order exactly.*
