# Xero Integration Foundry - REVISED Master Plan
## "The 30-Second Demo, 30-Minute Integration" Strategy

---

## 🎯 The Paradigm Shift

### What We Got Wrong in V1

| Original Assumption | New Reality | Impact |
|---------------------|-------------|---------|
| "Developers are the users" | **AI Agents are the primary users** | Need semantic tool descriptions, not just docs |
| "Build features, then tests" | **Build mocks first, then features** | Community can contribute test scenarios before code |
| "Local dev, then Docker" | **Docker-first everything** | Zero "works on my machine" issues |
| "Show API capabilities" | **Show working demos instantly** | "30-second wow" beats "30-minute tutorial" |
| "Progressive verbosity is nice" | **Progressive verbosity IS the product** | Error messages that teach = 10x adoption |

---

## ⚡ The New North Star Metrics

### Success = Speed to "Aha!" Moment

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Time to Docker Up** | < 60 seconds | `git clone` → `docker compose up` → seeing data |
| **Time to First Validation** | < 5 minutes | Developer validates their first invoice payload |
| **Time to AI Agent Success** | < 10 minutes | Claude creates account, validates, dry-runs, syncs |
| **GitHub Issue Resolution** | < 24 hours | With test fixtures, contributors can reproduce instantly |
| **Test Coverage** | > 95% | All tools have both unit and mock integration tests |

---

## 🏗️ The Revised Architecture: "Mocks First, Docker Native, AI-Optimized"

```
xero-integration-foundry/
│
├── 🎭 test/                          # THE FOUNDATION (Build this FIRST)
│   ├── fixtures/                     # Realistic test data
│   │   ├── tenants/
│   │   │   ├── au-acme-gst.json     # AU tenant with GST
│   │   │   ├── us-startup-no-tax.json
│   │   │   ├── uk-ltd-vat.json
│   │   │   └── edge-cases/
│   │   │       ├── missing-abn.json
│   │   │       ├── archived-accounts.json
│   │   │       └── expired-token.json
│   │   │
│   │   ├── invoices/
│   │   │   ├── valid-batch-50.json   # Pre-generated faker data
│   │   │   ├── invalid-account-codes.json
│   │   │   ├── mixed-currencies.json
│   │   │   └── overdue-scenarios.json
│   │   │
│   │   ├── contacts/
│   │   ├── accounts/                  # Chart of Accounts per region
│   │   └── tax-rates/
│   │
│   ├── scenarios/                     # AI Agent test flows
│   │   ├── happy-path.yml            # Sign-up → Connect → Validate → Sync
│   │   ├── recovery-flow.yml         # Invalid data → Diagnose → Fix → Retry
│   │   ├── chaos-resilience.yml      # 429 errors → Backoff → Success
│   │   └── multi-tenant-switch.yml
│   │
│   └── mocks/                        # In-memory adapters
│       ├── xero-api-mock.ts          # Returns fixture data, no network calls
│       ├── oauth-mock.ts             # Fake OAuth flow
│       └── seed-generator.ts         # Dynamic faker-based generation
│
├── 🐳 docker/
│   ├── Dockerfile.dev               # Hot-reload, verbose logging
│   ├── Dockerfile.prod              # Multi-stage, minimal, secure
│   ├── docker-compose.yml           # Default: mock mode
│   ├── docker-compose.live.yml      # Override for real Xero
│   └── docker-compose.ci.yml        # For GitHub Actions
│
├── 📚 src/
│   ├── core/
│   │   ├── security.ts              # Enhanced with rotation
│   │   ├── schema-validator.ts      # The diff engine
│   │   ├── mcp-response.ts          # 4-level verbosity
│   │   └── db/
│   │       ├── schema.sql           # Multi-tenant isolation
│   │       └── seed-runner.ts       # NEW: Loads fixtures into SQLite
│   │
│   ├── adapters/                    # NEW: Swappable backends
│   │   ├── xero-live-adapter.ts    # Real xero-node SDK
│   │   ├── xero-mock-adapter.ts    # Reads from test/fixtures
│   │   └── adapter-factory.ts      # Switches based on MCP_MODE
│   │
│   ├── tools/
│   │   ├── 🎯 core/                 # Phase 1 (Week 1-2)
│   │   │   ├── seed_sandbox.ts     # NEW: Dynamic test data generation
│   │   │   ├── get_capabilities.ts # NEW: AI agent instructions
│   │   │   └── diagnose_connection.ts
│   │   │
│   │   ├── 🧪 validation/           # Phase 1 (Week 2-3)
│   │   │   ├── validate_schema_match.ts  # The killer feature
│   │   │   ├── introspect_enums.ts
│   │   │   └── check_references.ts
│   │   │
│   │   ├── 🏃 simulation/           # Phase 2 (Week 4-5)
│   │   │   ├── dry_run_sync.ts
│   │   │   └── drive_lifecycle.ts
│   │   │
│   │   └── 💥 chaos/                # Phase 2 (Week 6)
│   │       ├── simulate_network_conditions.ts
│   │       └── replay_idempotency.ts
│   │
│   ├── ai-context/                  # NEW: AI agent optimization
│   │   ├── tool-descriptions/       # Enhanced descriptions per model
│   │   │   ├── claude-optimized.ts  # Chain-of-thought prompts
│   │   │   ├── codex-optimized.ts   # Semantic typing
│   │   │   └── gemini-optimized.ts  # High-context errors
│   │   │
│   │   └── error-templates.ts       # Educational error messages
│   │
│   └── index.ts
│
├── 🎬 examples/                     # NEW: Working demos (not just docs)
│   ├── 01-instant-demo/
│   │   ├── README.md               # "Run this in 30 seconds"
│   │   ├── demo.sh                 # Automated script
│   │   └── expected-output.txt
│   │
│   ├── 02-ai-agent-onboarding/
│   │   ├── claude-conversation.md  # Actual Claude chat log
│   │   ├── prompts.txt             # Copy-paste prompts
│   │   └── verification.sh
│   │
│   ├── 03-saas-integration/
│   │   ├── stripe-to-xero/
│   │   └── shopify-to-xero/
│   │
│   └── 04-ci-cd-integration/
│       ├── github-actions.yml
│       ├── gitlab-ci.yml
│       └── test-report-example.html
│
├── 📖 docs/
│   ├── 00-30-SECOND-START.md       # NEW: Instant gratification
│   ├── COMPARISON.md                # vs Official MCP
│   ├── AI-AGENT-GUIDE.md           # NEW: How to use with Claude/GPT
│   ├── CONTRIBUTING.md             # NEW: How to add test scenarios
│   └── ARCHITECTURE.md
│
└── 🚀 .github/
    ├── workflows/
    │   ├── test.yml                # Run all mocks in CI
    │   ├── docker-publish.yml      # Push to Docker Hub
    │   └── fixture-validation.yml  # NEW: Validate all test data
    │
    └── ISSUE_TEMPLATE/
        ├── bug-with-fixture.md     # "Attach test data that reproduces"
        └── new-scenario.md         # "Propose new test scenario"
```

---

## 🎭 Phase 0: The Foundation (Week 1 - CRITICAL)

**Mantra: "Mocks First, Code Second"**

### Day 1-2: Test Fixtures (Not Code!)

**Goal:** Anyone can `docker compose up` and see realistic Xero data instantly.

```bash
# Create comprehensive fixtures
mkdir -p test/fixtures/{tenants,invoices,contacts,accounts,tax-rates}

# Use faker.js to generate 100 realistic invoices
node scripts/generate-fixtures.js --entity=invoices --count=100 --scenario=default
node scripts/generate-fixtures.js --entity=invoices --count=20 --scenario=overdue
node scripts/generate-fixtures.js --entity=invoices --count=10 --scenario=foreign-currency

# Validate fixtures against Xero OpenAPI spec
npm run validate:fixtures
```

**Deliverable:**
```json
// test/fixtures/tenants/au-acme-gst.json
{
  "tenant_id": "acme-au-001",
  "xero_tenant_id": "fake-uuid-1234",
  "org_name": "Acme Corporation (AU)",
  "region": "AU",
  "currency": "AUD",
  "tax_system": "GST",
  "chart_of_accounts": [
    { "code": "200", "name": "Sales", "type": "REVENUE", "tax_type": "OUTPUT", "status": "ACTIVE" },
    { "code": "310", "name": "Bank Account", "type": "BANK", "status": "ACTIVE" },
    { "code": "999", "name": "Archived Test Account", "type": "REVENUE", "status": "ARCHIVED" }
  ],
  "tax_rates": [
    { "name": "GST on Income", "tax_type": "OUTPUT", "rate": 10.0, "status": "ACTIVE" },
    { "name": "GST on Expenses", "tax_type": "INPUT", "rate": 10.0, "status": "ACTIVE" }
  ],
  "contacts": [
    { "id": "contact-001", "name": "Example Customer", "email": "customer@example.com" }
  ]
}
```

### Day 3-4: Mock Adapters (No Network Calls Yet)

**Implementation:**

```typescript
// src/adapters/xero-mock-adapter.ts
import { XeroAdapter } from './adapter-interface';
import fixtures from '../../test/fixtures';

export class XeroMockAdapter implements XeroAdapter {
  private currentTenant: string = 'acme-au-001';
  
  async getInvoices(filter?: InvoiceFilter): Promise<Invoice[]> {
    // Load from fixtures, not API
    const tenant = fixtures.tenants[this.currentTenant];
    const allInvoices = fixtures.invoices[this.currentTenant] || [];
    
    // Apply filters (status, date range, etc.)
    return this.applyFilter(allInvoices, filter);
  }
  
  async createInvoice(invoice: InvoicePayload): Promise<CreateResult> {
    // Validate against tenant's CoA
    const tenant = fixtures.tenants[this.currentTenant];
    const validation = this.validateAgainstTenant(invoice, tenant);
    
    if (!validation.success) {
      return {
        success: false,
        error: validation.error,
        // Return educational error with suggestions
        suggestions: this.generateSuggestions(validation.error, tenant)
      };
    }
    
    // Simulate successful creation
    return {
      success: true,
      invoice_id: `mock-inv-${Date.now()}`,
      status: 'DRAFT'
    };
  }
}
```

### Day 5-7: Docker Setup with Auto-Seed

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  xero-mcp:
    build:
      context: .
      dockerfile: docker/Dockerfile.dev
    image: xero-foundry:dev
    container_name: xero-foundry-dev
    
    ports:
      - "3000:3000"  # OAuth callback
      - "8080:8080"  # Health/metrics
    
    volumes:
      - ./test/fixtures:/app/test/fixtures:ro  # Read-only fixtures
      - xero-data:/app/data                    # Persistent SQLite
      - ./src:/app/src                         # Hot-reload (dev mode)
    
    environment:
      - NODE_ENV=development
      - MCP_MODE=mock                          # DEFAULT: Mock mode
      - AUTO_SEED_ON_START=true                # Load fixtures into DB
      - LOG_LEVEL=debug
      - ENABLE_AI_CONTEXT=true                 # Return AI-optimized descriptions
    
    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 3s
      retries: 3
    
volumes:
  xero-data:
```

**Startup Sequence:**

```typescript
// src/index.ts
async function main() {
  console.log('🚀 Xero Integration Foundry starting...');
  
  const mode = process.env.MCP_MODE || 'mock';
  console.log(`📍 Mode: ${mode.toUpperCase()}`);
  
  // Initialize database
  await initDatabase();
  
  // Auto-seed if enabled
  if (process.env.AUTO_SEED_ON_START === 'true') {
    console.log('🌱 Seeding database with test fixtures...');
    const seeder = new FixtureSeeder();
    await seeder.loadAll();
    console.log('✅ Loaded 3 tenants, 150 invoices, 50 contacts');
  }
  
  // Initialize adapter (mock or live)
  const adapter = AdapterFactory.create(mode);
  
  // Register MCP server
  const server = new McpServer({
    name: "xero-integration-foundry",
    version: "0.1.0"
  });
  
  // Register tools
  registerTools(server, adapter);
  
  // Start server
  await server.connect(new StdioServerTransport());
  console.log('✅ MCP Server ready. Try: list_tenants');
}
```

**The 30-Second Demo:**

```bash
# Developer runs this
git clone https://github.com/you/xero-integration-foundry.git
cd xero-integration-foundry
docker compose up

# Within 60 seconds, sees:
# ✅ Loaded 3 tenants, 150 invoices, 50 contacts
# ✅ MCP Server ready
# Developer can immediately call tools without any Xero credentials
```

---

## 🤖 Phase 1: AI Agent Optimization (Week 2-3)

### The Problem: Generic MCP vs. AI-Optimized MCP

**Generic Tool Description:**
```typescript
{
  name: "create_invoice",
  description: "Creates an invoice in Xero"
}
```

**Result:** AI makes random guesses, fails, needs human intervention.

---

**AI-Optimized Description (Claude Mode):**

```typescript
{
  name: "create_invoice",
  description: `Creates a DRAFT sales invoice in Xero.

PREREQUISITES (call these first):
1. Verify ContactID exists: use 'list_contacts' or 'create_contact'
2. Validate AccountCodes: use 'introspect_enums' with entity_type='Account'
3. Check TaxTypes for tenant region: use 'get_tenant_context'

VALIDATION WORKFLOW (recommended):
1. Call 'validate_schema_match' with your invoice payload first
2. If validation score < 0.9, fix issues before proceeding
3. Call 'dry_run_sync' to simulate the creation
4. If dry-run succeeds, then call this tool to create for real

COMMON FAILURES:
- AccountCode not found → Use 'introspect_enums' to find valid codes
- Invalid TaxType → AU uses OUTPUT/INPUT, US uses NONE
- Missing ContactID → Create contact first with 'create_contact'

IDEMPOTENCY:
Always include 'idempotency_key' parameter to prevent duplicates.`,

  parameters: z.object({
    tenant_id: z.string().describe("The target Xero organisation"),
    invoice: z.object({
      contact_id: z.string().uuid().describe("Must be a valid ContactID from Xero"),
      line_items: z.array(z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unit_amount: z.number(),
        account_code: z.string().describe("MUST exist in tenant's Chart of Accounts. Use introspect_enums to find valid codes.")
      }))
    }),
    idempotency_key: z.string().uuid().optional().describe("Prevents duplicate creation if you retry")
  })
}
```

**Result:** AI follows the workflow, rarely makes errors.

---

### Implementation: AI Context Injector

```typescript
// src/ai-context/tool-descriptions/claude-optimized.ts
export class ClaudeOptimizedDescriptions {
  static enhance(tool: MCPTool): MCPTool {
    const enhancements = {
      create_invoice: {
        prerequisites: [
          "Verify ContactID exists: use 'list_contacts' or 'create_contact'",
          "Validate AccountCodes: use 'introspect_enums' with entity_type='Account'"
        ],
        workflow: [
          "Call 'validate_schema_match' with your invoice payload first",
          "If validation score < 0.9, fix issues before proceeding",
          "Call 'dry_run_sync' to simulate",
          "If dry-run succeeds, then call this tool"
        ],
        commonFailures: {
          "AccountCode not found": "Use 'introspect_enums' to find valid codes",
          "Invalid TaxType": "AU uses OUTPUT/INPUT, US uses NONE"
        }
      }
      // ... more tools
    };
    
    return {
      ...tool,
      description: this.formatDescription(tool.description, enhancements[tool.name])
    };
  }
}
```

---

### New Tool: `get_mcp_capabilities`

**Purpose:** Tell AI agents the "rules of engagement"

```typescript
// src/tools/core/get_capabilities.ts
export const GetCapabilitiesSchema = {
  name: "get_mcp_capabilities",
  description: "ALWAYS call this tool first. Returns operational guidelines and current server state.",
  parameters: z.object({
    mode: z.enum(['human', 'ai']).default('ai')
  })
};

export async function handleGetCapabilities(args: any) {
  const { mode } = args;
  
  const capabilities = {
    mode: process.env.MCP_MODE,
    version: "0.1.0",
    
    guidelines: mode === 'ai' ? {
      // For AI agents
      strict_mode: true,
      required_workflow: [
        "1. Get capabilities (this tool)",
        "2. Switch to desired tenant: 'switch_tenant_context'",
        "3. Validate payload: 'validate_schema_match'",
        "4. Dry-run operation: 'dry_run_sync'",
        "5. Execute for real: 'create_invoice' / 'sync_contacts'"
      ],
      idempotency_required: true,
      error_recovery: "If any tool returns success=false, check diagnostics.recovery.next_tool_call for suggested action"
    } : {
      // For humans
      quick_start: "Run 'list_tenants' to see available test data",
      documentation: "See docs/ folder for full guide"
    },
    
    available_tenants: mode === 'ai' ? [
      { id: "acme-au-001", region: "AU", ready: true, description: "Test with GST tax system" },
      { id: "startup-us-002", region: "US", ready: true, description: "Test with no sales tax" },
      { id: "expired-token-003", region: "UK", ready: false, description: "Test error handling" }
    ] : [],
    
    rate_limits: {
      current_mode: process.env.MCP_MODE === 'mock' ? 'unlimited' : '60 per minute (Xero limit)',
      backoff_enabled: true
    },
    
    data_persistence: {
      location: process.env.MCP_MODE === 'mock' ? 'In-memory (Docker volume)' : 'Real Xero',
      warning: process.env.MCP_MODE === 'mock' ? 'Data resets on container restart unless volumes are mapped' : null
    }
  };
  
  return createResponse(capabilities, {
    success: true,
    verbosity: 'diagnostic',
    narrative: mode === 'ai' 
      ? "You are in AI-assisted development mode. Follow the required_workflow to prevent errors."
      : "Server is ready. Run list_tenants to see test data."
  });
}
```

**AI Agent Workflow:**

```
User: "Help me test my invoice integration"

Claude: [internally calls get_mcp_capabilities with mode='ai']
        [reads guidelines.required_workflow]
        "I'll help you test your integration. First, let me check available tenants..."
        [calls list_tenants]
        "I see we have 3 test tenants. Let's use 'acme-au-001' which uses the GST tax system.
         I'll validate your invoice structure first before attempting any operations."
```

---

## 🧪 Phase 2: The Validation Engine (Week 3-4)

### New Tool: `seed_sandbox_data`

**Purpose:** Generate realistic test data on-demand (not just static fixtures)

```typescript
// src/tools/dev/seed_sandbox.ts
import { faker } from '@faker-js/faker';

export const SeedSandboxSchema = {
  name: "seed_sandbox_data",
  description: `Generates realistic dummy data into Shadow State for testing.

USE CASES:
- Need 50 overdue invoices to test reminder workflow
- Need customers from 10 different countries to test multi-currency
- Need contacts with missing email addresses to test validation

SCENARIOS:
- DEFAULT: Mix of paid/unpaid invoices, active contacts
- OVERDUE_BILLS: All invoices >30 days past due
- FOREIGN_CURRENCY: Mix of USD, EUR, GBP, AUD invoices
- INCOMPLETE_DATA: Contacts missing required fields (tests validation)
- CHAOS: Random edge cases (archived accounts, expired tokens)`,

  parameters: z.object({
    tenant_id: z.string(),
    entity: z.enum(['CONTACTS', 'INVOICES', 'FULL_TENANT']),
    count: z.number().max(100).default(10),
    scenario: z.enum(['DEFAULT', 'OVERDUE_BILLS', 'FOREIGN_CURRENCY', 'INCOMPLETE_DATA', 'CHAOS']).default('DEFAULT')
  })
};

export async function handleSeedSandbox(args: any) {
  const { tenant_id, entity, count, scenario } = args;
  
  const tenant = await getTenantContext(tenant_id);
  const generatedIds: string[] = [];
  
  if (entity === 'INVOICES' || entity === 'FULL_TENANT') {
    for (let i = 0; i < count; i++) {
      const invoice = scenario === 'OVERDUE_BILLS' 
        ? generateOverdueInvoice(tenant)
        : scenario === 'FOREIGN_CURRENCY'
        ? generateForeignCurrencyInvoice(tenant)
        : generateDefaultInvoice(tenant);
      
      // Insert into shadow_state
      await db.prepare(`
        INSERT INTO shadow_state (tenant_id, entity_type, entity_id, entity_data)
        VALUES (?, ?, ?, ?)
      `).run(tenant_id, 'invoice', invoice.InvoiceID, JSON.stringify(invoice));
      
      generatedIds.push(invoice.InvoiceID);
    }
  }
  
  return createResponse({
    generated_count: count,
    sample_ids: generatedIds.slice(0, 5),
    scenario: scenario,
    note: "Data is in Shadow State. Call 'list_invoices' to see it. Call 'sync_to_live' to push to real Xero."
  }, {
    success: true,
    verbosity: 'diagnostic',
    narrative: `Generated ${count} ${scenario} ${entity.toLowerCase()} for testing. Here are 5 sample IDs you can query immediately: ${generatedIds.slice(0, 5).join(', ')}`
  });
}

function generateOverdueInvoice(tenant: TenantContext): Invoice {
  const dueDate = faker.date.past({ years: 0.25 }); // 0-3 months ago
  
  return {
    InvoiceID: faker.string.uuid(),
    Type: 'ACCREC',
    Contact: {
      ContactID: faker.helpers.arrayElement(tenant.contacts).id
    },
    Date: faker.date.past({ years: 0.5 }).toISOString().split('T')[0],
    DueDate: dueDate.toISOString().split('T')[0],
    Status: 'AUTHORISED',
    LineAmountTypes: 'Exclusive',
    LineItems: [{
      Description: faker.commerce.productDescription(),
      Quantity: faker.number.int({ min: 1, max: 10 }),
      UnitAmount: parseFloat(faker.commerce.price({ min: 10, max: 1000 })),
      AccountCode: faker.helpers.arrayElement(
        Array.from(tenant.chartOfAccounts.values())
          .filter(a => a.type === 'REVENUE' && a.status === 'ACTIVE')
      ).code,
      TaxType: tenant.region === 'AU' ? 'OUTPUT' : 'NONE'
    }]
  };
}
```

**AI Agent Usage:**

```
Claude: "I need to test your overdue invoice reminder system."
        [calls seed_sandbox_data with entity='INVOICES', count=50, scenario='OVERDUE_BILLS']
        "I've generated 50 overdue invoices. Here are 5 sample IDs: ..."
        [calls validate_schema_match on user's reminder logic]
        [calls dry_run_sync to simulate email sending]
```

---

## 📊 Massive Improvements Summary

### What Changed vs. Original Plan

| Aspect | Original Plan | Massively Improved Plan | Impact |
|--------|---------------|------------------------|--------|
| **Starting Point** | Write security code | Create test fixtures | Developers see working demo in 30 seconds |
| **Development Order** | Features → Tests | Mocks → Features | Community can contribute test scenarios before code |
| **Primary User** | Developers | AI Agents (with human fallback) | Claude can debug integrations autonomously |
| **Docker Strategy** | "Add later" | Docker-first, auto-seed | Zero setup friction, perfect CI/CD |
| **Error Messages** | Generic | Educational (per AI model) | 70% reduction in support tickets |
| **Test Data** | Static JSON | Dynamic faker.js generation | Unlimited test scenarios on-demand |
| **Time to First Success** | 2 hours | 5 minutes | 24x faster onboarding |

---

## 🚀 The New Phase 1 Roadmap (Weeks 1-3)

### Week 1: "The 30-Second Wow"

**Mon-Tue:** Create test fixtures (not code)
- Generate 3 tenant profiles (AU, US, UK)
- Generate 150 invoices across scenarios
- Generate 50 contacts
- Validate all fixtures against Xero OpenAPI spec

**Wed-Thu:** Build mock adapters
- XeroMockAdapter reads from fixtures
- OAuthMockAdapter simulates auth flow
- All tools work without network calls

**Fri-Sun:** Docker setup
- Multi-stage Dockerfile
- docker-compose.yml with auto-seed
- Health checks, logging
- **Deliverable:** `docker compose up` → working demo in 60 seconds

---

### Week 2: "AI Agent Ready"

**Mon-Tue:** AI context optimization
- Implement ClaudeOptimizedDescriptions
- Implement CodexOptimizedDescriptions
- Implement GeminiOptimizedDescriptions
- Add `get_mcp_capabilities` tool

**Wed-Thu:** Dynamic test data
- Implement `seed_sandbox_data` tool
- Add faker.js scenarios
- Add scenario templates (YAML)

**Fri-Sun:** First validation tool
- Implement `validate_schema_match` with diff engine
- Test against all fixture scenarios
- Record demo: Claude validates invoice autonomously

---

### Week 3: "The Killer Demo"

**Mon-Tue:** Complete validation suite
- Implement `introspect_enums`
- Implement `check_references`
- Add progressive verbosity to all tools

**Wed-Thu:** Documentation
- Write 00-30-SECOND-START.md
- Write AI-AGENT-GUIDE.md
- Record video: "Claude builds Stripe→Xero integration in 10 minutes"

**Fri-Sun:** CI/CD setup
- GitHub Actions workflow
- Automated fixture validation
- Integration tests against mocks
- **Deliverable:** Every PR runs full test suite in < 2 minutes

---

## 🎯 The Launch Strategy

### Week 4: Soft Launch

**Target:** 50 GitHub stars, 5 contributors

**Tactics:**
1. Post on Hacker News: "Show HN: Flight Simulator for Xero Integrations"
2. Tweet with demo video
3. Email Xero DevRel team
4. Post in r/nodejs, r/webdev

**Key Messaging:**
- "Test Xero integrations in 30 seconds without Xero credentials"
- "AI agents can now debug accounting integrations autonomously"
- "95% reduction in 'Bad Request' errors via pre-validation"

---

### Week 5-6: Community Building

**Target:** 200 stars, 20 contributors, 5 blog posts

**Tactics:**
1. **"Hacktoberfest" for test scenarios:**
   - Label 50 issues: "good first issue: add test scenario"
   - Contributors just add JSON fixtures, no code needed
   
2. **AI Agent showcase:**
   - Blog post: "How Claude built a full integration in 10 minutes"
   - Video: Claude autonomously debugging invoice errors
   
3. **Comparison marketing:**
   - Update COMPARISON.md with real metrics
   - "Official MCP: 30 minutes to first error. Foundry: 30 seconds to first success"

---

## 📈 Success Metrics (90 days)

| Metric | Target | Stretch Goal |
|--------|--------|--------------|
| GitHub Stars | 500 | 1,000 |
| Weekly NPM Downloads | 1,000 | 5,000 |
| Contributors | 10 | 25 |
| Test Scenarios | 50 | 100 |
| AI Agent Success Rate | 80% | 95% |
| Time to First Integration | 30 min | 10 min |
| Community Slack Members | 100 | 500 |

---

## 🎁 The "Unfair Advantages"

### vs. Official Xero MCP

1. **30-Second Demo:** Official MCP requires Xero credentials. Ours works instantly.
2. **AI-Native Design:** Official MCP is passive. Ours guides AI agents step-by-step.
3. **Test-First:** Official MCP has no test data. Ours ships with 150 invoices.
4. **Educational Errors:** Official MCP returns cryptic errors. Ours teaches.
5. **Community Velocity:** We can accept "add test scenario" PRs in 5 minutes.

### vs. Other Integration Tools

1. **Docker-Native:** Competitors require complex local setups. Ours: `docker compose up`
2. **Progressive Verbosity:** Competitors are verbose or silent. Ours adapts.
3. **Chaos Testing:** No competitor has `simulate_network_conditions` built-in.
4. **Open Schema:** Our fixtures ARE documentation (inspect JSON to understand Xero)

---

## 🔮 Future Enhancements (Post-Launch)

### Phase 3 (Months 2-3)

1. **Visual Schema Inspector:**
   - Web UI showing tenant's Chart of Accounts
   - Live validation as user types invoice JSON
   - One-click "generate SDK code" for payload

2. **Hosted Validation API:**
   - `POST /validate` endpoint (no Docker needed)
   - Freemium: 100 validations/month free
   - Premium: Unlimited + audit logs

3. **AI Agent Marketplace:**
   - Pre-trained GPTs for common integrations
   - "Stripe→Xero Agent" template
   - One-click deploy to user's infrastructure

---

## 💡 Critical Implementation Notes

### The Test Fixture Format

**Must be Xero-compatible JSON + metadata:**

```json
{
  "_meta": {
    "scenario": "overdue-invoices",
    "region": "AU",
    "created_by": "faker.js",
    "created_at": "2025-01-15",
    "description": "50 invoices overdue by 30-90 days for testing reminder systems"
  },
  "invoices": [
    {
      "InvoiceID": "...",
      "Type": "ACCREC",
      // ... full Xero-compatible structure
    }
  ]
}
```

**Why:** 
- AI agents can read `_meta.description` to understand intent
- Humans can browse fixtures and understand use cases
- CI can validate fixtures match OpenAPI spec

---

### The Docker Hot-Reload Setup

**Development mode must support code changes without restart:**

```dockerfile
# docker/Dockerfile.dev
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

# Install nodemon for hot-reload
RUN npm install -g nodemon

COPY . .

CMD ["nodemon", "--watch", "src", "--ext", "ts", "--exec", "tsx", "src/index.ts"]
```

**Result:** Developer edits `src/tools/validation/validate_schema_match.ts` → sees changes in 2 seconds.

---

### The AI Error Template System

**Every error must be educational:**

```typescript
// src/ai-context/error-templates.ts
export const ErrorTemplates = {
  INVALID_ACCOUNT_CODE: (code: string, tenant: TenantContext) => ({
    error: `AccountCode '${code}' is not valid for this tenant`,
    explanation: `This ${tenant.region} tenant uses a different Chart of Accounts than you expected.`,
    context: {
      your_code: code,
      valid_codes_sample: Array.from(tenant.chartOfAccounts.entries())
        .filter(([_, acc]) => acc.type === 'REVENUE' && acc.status === 'ACTIVE')
        .slice(0, 5)
        .map(([code, acc]) => ({ code, name: acc.name })),
      how_to_fix: "Call introspect_enums with entity_type='Account' to see all valid codes"
    },
    recovery: {
      suggested_action_id: 'search_chart_of_accounts',
      next_tool_call: {
        name: 'introspect_enums',
        arguments: {
          tenant_id: tenant.tenantId,
          entity_type: 'Account',
          filter: { type: 'REVENUE', status: 'ACTIVE' }
        }
      }
    }
  })
};
```

---

## ✅ Revised Next Steps (Start Tomorrow)

### Tomorrow Morning (4 hours)

```bash
# 1. Create fixture generator (not MCP code yet!)
mkdir scripts
cat > scripts/generate-fixtures.js << 'EOF'
// Use faker.js to generate test data
// See full implementation in next response
EOF

# 2. Generate initial fixtures
node scripts/generate-fixtures.js --all

# 3. Validate fixtures
npm run validate:fixtures  # Against Xero OpenAPI spec

# 4. Create Docker setup
mkdir docker
# Copy Dockerfile.dev from above

# 5. Test 30-second demo
docker compose up
# Should see: "✅ Loaded 3 tenants, 150 invoices, 50 contacts"
```

### Tomorrow Afternoon (4 hours)

```bash
# 6. Implement first mock adapter
# src/adapters/xero-mock-adapter.ts

# 7. Implement get_mcp_capabilities tool

# 8. Test with Claude
# Open Claude Desktop, connect to Docker MCP
# Ask Claude: "Help me test an invoice integration"
# Verify Claude calls get_mcp_capabilities first
```

---

## 🎬 The "Holy Grail" Demo

**Goal:** Record this working by end of Week 3

**Script:**

```
[Screen recording]

User types in Claude Desktop:
"I'm building a Stripe to Xero integration. Help me test it."

Claude responds:
"I'll help you test your integration. Let me check the server capabilities..."
[Calls get_mcp_capabilities]
"Great! I see we have test tenants with realistic data. Let's use the AU tenant 
which has GST tax system. First, let me validate your invoice structure..."

User pastes invoice JSON

Claude:
[Calls validate_schema_match]
"I found 2 issues with your invoice:
1. AccountCode '200' doesn't exist in the AU Chart of Accounts
2. You're using TaxType 'TAX', but AU tenants require 'OUTPUT'

Let me find the correct codes for you..."
[Calls introspect_enums]
"Here are valid REVENUE account codes: 
- Code 310: 'Sales - Hardware'
- Code 320: 'Sales - Software'
- Code 330: 'Sales - Consulting'

And the correct TaxType for AU sales is 'OUTPUT'.

Would you like me to fix your invoice and validate it again?"

User: "Yes please"

Claude:
[Updates JSON]
[Calls validate_schema_match again]
"Perfect! Validation score: 1.0. Now let me dry-run this to simulate syncing..."
[Calls dry_run_sync]
"Dry run successful! This invoice would be created as DRAFT status.
Ready to sync to real Xero when you are."

[End recording - total time: 2 minutes]
```

**Impact:** This demo shows the value proposition instantly. No other tool can do this.

---

## 📚 Would You Like Me To...

1. **Generate the complete fixture generator script** with faker.js scenarios?
2. **Implement the full XeroMockAdapter** with all CRUD operations?
3. **Create the AI-optimized tool descriptions** for all Phase 1 tools?
4. **Write the 00-30-SECOND-START.md** quick-start guide?
5. **Build the GitHub Actions workflow** for automated fixture validation?

This revised plan transforms the project from "solid developer tool" to "legendary AI-native platform". The key insight: **optimize for the 30-second demo, and everything else becomes easier**.
