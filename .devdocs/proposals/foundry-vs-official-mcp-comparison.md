# Xero Integration Foundry vs. Official Xero MCP Server

## TL;DR - Choose the Right Tool

| If you need to... | Use This |
|------------------|----------|
| **Ask AI about your Xero data** ("What's my cash position?") | ✅ Official Xero MCP |
| **Build a SaaS app that syncs to Xero** | ✅ Integration Foundry |
| **Test integration logic without hitting live Xero** | ✅ Integration Foundry |
| **Debug why invoice creation fails** | ✅ Integration Foundry |
| **Quick read-only queries from Claude** | ✅ Official Xero MCP |
| **Validate payloads before sending to Xero API** | ✅ Integration Foundry |

---

## Side-by-Side Comparison

### 1. Architecture & Purpose

| Aspect | Official Xero MCP | Integration Foundry |
|--------|-------------------|---------------------|
| **Primary Goal** | Enable AI assistants to query live Xero data | Enable developers to build/test SaaS integrations |
| **Target User** | End users (via Claude, ChatGPT) | SaaS developers, QA engineers |
| **Data Flow** | User ↔ AI ↔ Live Xero | Developer ↔ Foundry ↔ Shadow State + Xero |
| **State Management** | Stateless (no caching) | Stateful (shadow state, validation cache) |
| **Multi-Tenancy** | Basic (switch via config) | Advanced (tenant context isolation) |

**Example Use Cases:**

**Official MCP:**
```
User: "Claude, show me my top 5 customers by revenue this quarter"
Claude: [calls list-invoices → aggregates → responds]
```

**Integration Foundry:**
```
Developer: "Validate this batch of 50 invoices before I sync them"
Foundry: [dry_run_sync → 48 valid, 2 invalid → detailed error report]
```

---

### 2. Tool Inventory

#### Official Xero MCP Tools (38 total)

**Read Operations:**
- `list-accounts`, `list-contacts`, `list-invoices`, `list-payments`
- `list-quotes`, `list-credit-notes`, `list-items`, `list-tax-rates`
- `list-bank-transactions`, `list-profit-and-loss`, `list-trial-balance`
- `list-report-balance-sheet`, `list-aged-receivables-by-contact`
- Payroll: `list-payroll-employees`, `list-payroll-employee-leave`, etc.

**Write Operations:**
- `create-contact`, `create-invoice`, `create-payment`, `create-quote`
- `update-contact`, `update-invoice`, `update-quote`
- Payroll: `create-payroll-timesheet`, `update-payroll-timesheet-line`

**Strengths:**
- ✅ Comprehensive coverage of Xero Accounting & Payroll APIs
- ✅ Direct mapping to Xero endpoints (minimal abstraction)
- ✅ Works with Claude Desktop out-of-the-box

**Limitations:**
- ❌ No validation before API calls
- ❌ No sandbox/dry-run mode
- ❌ Raw Xero error messages (not developer-friendly)
- ❌ No tenant context caching

---

#### Integration Foundry Tools (Proposed)

**Developer Experience Tools:**
- `diagnose_connection` - Health check with scope analysis
- `switch_tenant_context` - Load tenant-specific schemas
- `audit_access_rights` - Pre-flight permission check

**Validation & Testing:**
- `validate_schema_match` - **The Diff Engine** (compares payload to Xero spec + tenant context)
- `introspect_enums` - Get valid values for fields (TaxTypes, AccountCodes)
- `check_references` - Verify ContactIDs/AccountCodes exist
- `dry_run_sync` - **The Sandbox** (simulate batch operations)
- `drive_lifecycle_state` - State machine testing (DRAFT → AUTHORISED → PAID)

**Resilience Testing:**
- `simulate_network_conditions` - Chaos engineering (429s, 500s, token expiry)
- `replay_idempotency` - Test duplicate request handling

**Standard Operations:**
- All CRUD operations from official MCP (contacts, invoices, payments, etc.)
- **BUT** with enhanced error handling and progressive verbosity

**Strengths:**
- ✅ Developer-first design (validation, testing, debugging)
- ✅ Saves API calls via shadow state caching
- ✅ Educational error messages with recovery suggestions
- ✅ CI/CD integration ready

**Limitations:**
- ⚠️ More complex setup (requires SQLite, encryption key)
- ⚠️ Larger scope = slower initial development

---

### 3. Response Format Comparison

#### Official MCP Response
```json
{
  "content": [
    {
      "type": "text",
      "text": "Here are your invoices:\n- Invoice #101: $1,500\n- Invoice #102: $2,300"
    }
  ]
}
```

**Or on error:**
```json
{
  "error": {
    "message": "The request did not satisfy the required schema"
  }
}
```

**Analysis:**
- ✅ Clean for AI consumption
- ❌ No structured metadata for programmatic use
- ❌ Errors lack context (which field failed? why?)

---

#### Integration Foundry Response (Compact Mode)
```json
{
  "success": true,
  "data": {
    "invoices_validated": 50,
    "ready_to_sync": 48
  },
  "meta": {
    "timestamp": "2025-11-22T10:30:00Z",
    "request_id": "req_abc123",
    "execution_time_ms": 142,
    "score": 0.96
  }
}
```

**Diagnostic Mode (for debugging):**
```json
{
  "success": false,
  "data": {
    "invoices_validated": 50,
    "failures": 2
  },
  "meta": {
    "timestamp": "2025-11-22T10:30:00Z",
    "request_id": "req_abc123",
    "score": 0.0
  },
  "diagnostics": {
    "narrative": "2 invoices failed validation. Both have invalid AccountCode references that don't exist in your AU tenant's Chart of Accounts.",
    "validation_score": 0.0,
    "warnings": [
      "Invoice #101: AccountCode '999' not found",
      "Invoice #102: AccountCode '200' is ARCHIVED"
    ],
    "root_cause": "AccountCode mismatch"
  },
  "recovery": {
    "suggested_action_id": "search_valid_accounts",
    "description": "Search for active REVENUE account codes in your Chart of Accounts",
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": {
        "entity_type": "Account",
        "filter": { "type": "REVENUE", "status": "ACTIVE" }
      }
    }
  }
}
```

**Analysis:**
- ✅ Structured for programmatic consumption
- ✅ Progressive verbosity (compact for production, diagnostic for dev)
- ✅ Actionable recovery suggestions
- ✅ Compliance scoring for quality metrics

---

### 4. Error Handling Philosophy

#### Official MCP
```typescript
// Error example from real usage
{
  "error": "The request did not satisfy the required schema",
  "status": 400
}
```

**Developer experience:**
1. Call API with invalid invoice
2. Get cryptic error
3. Read Xero API docs
4. Trial-and-error until it works
5. Still unsure if it will fail for different tenant configs

**Time to resolution: 30-60 minutes**

---

#### Integration Foundry
```typescript
// Same error scenario
{
  "success": false,
  "data": { "validation_passed": false },
  "diagnostics": {
    "narrative": "Invoice structure is valid JSON, but functionally invalid for this Tenant's AU configuration.",
    "root_cause": "AccountCode mismatch",
    "diff": [
      {
        "field": "LineItems[0].AccountCode",
        "issue": "Invalid account type",
        "expected": "REVENUE type account (e.g., 200, 310)",
        "received": "999 (not found in Chart of Accounts)",
        "severity": "error"
      }
    ]
  },
  "recovery": {
    "suggested_action_id": "search_chart_of_accounts",
    "next_tool_call": {
      "name": "introspect_enums",
      "arguments": { "entity_type": "Account", "filter": { "type": "REVENUE" } }
    }
  }
}
```

**Developer experience:**
1. Call `validate_schema_match` with invoice payload
2. Get detailed diff showing exactly what's wrong
3. Follow suggested `next_tool_call` to find valid AccountCodes
4. Fix payload
5. Call `dry_run_sync` to verify
6. Sync with confidence

**Time to resolution: 2-5 minutes**

**ROI Calculation:**
- If a developer hits 10 integration errors per week
- Foundry saves ~45 minutes each
- **= 7.5 hours/week saved per developer**

---

### 5. Testing & CI/CD Integration

#### Official MCP

**Testing Strategy:**
```bash
# Manual testing only
1. Open Claude Desktop
2. Ask Claude to create test invoice
3. Check Xero manually
4. Repeat for each edge case
```

**CI/CD Integration:**
- ❌ Not designed for automated testing
- ❌ Requires live Xero connection
- ❌ Can't run in parallel (no tenant isolation)
- ❌ No dry-run mode

**Best Practice:**
- Test in Xero Demo Company (manual)
- Hope for the best in production

---

#### Integration Foundry

**Testing Strategy:**
```typescript
// Automated test suite
describe('Invoice Sync Integration', () => {
  it('should validate and dry-run invoice batch', async () => {
    const invoices = generateTestInvoices(50);
    
    // Step 1: Validate schemas
    const validation = await foundry.validate_schema_match({
      tenant_id: 'test-tenant',
      entity_type: 'Invoice',
      payloads: invoices,
      verbose: true
    });
    
    expect(validation.success).toBe(true);
    expect(validation.meta.score).toBeGreaterThan(0.95);
    
    // Step 2: Dry run
    const dryRun = await foundry.dry_run_sync({
      tenant_id: 'test-tenant',
      resource: 'invoices',
      payloads: invoices
    });
    
    expect(dryRun.data.predicted_success).toBe(50);
    
    // Step 3: Simulate chaos
    await foundry.simulate_network_conditions({
      tenant_id: 'test-tenant',
      condition: 'THROTTLE',
      rate: 3 // requests per minute
    });
    
    // Step 4: Test resilience
    const result = await foundry.sync_invoices({
      tenant_id: 'test-tenant',
      invoices: invoices.slice(0, 5)
    });
    
    expect(result.success).toBe(true); // Should handle rate limits
  });
});
```

**CI/CD Integration:**
- ✅ Designed for automated testing
- ✅ No live Xero connection needed (shadow state)
- ✅ Parallel test execution (tenant isolation)
- ✅ Chaos engineering built-in

**GitHub Actions Example:**
```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Foundry
        run: |
          npm install @xeroapi/integration-foundry
          sqlite3 test.db < schema.sql
      - name: Run Integration Tests
        env:
          MCP_ENCRYPTION_KEY: ${{ secrets.TEST_ENCRYPTION_KEY }}
        run: npm test
```

---

### 6. Multi-Tenant Management

#### Official MCP

**Configuration:**
```json
{
  "mcpServers": {
    "xero": {
      "env": {
        "XERO_CLIENT_ID": "single-org-id",
        "XERO_CLIENT_SECRET": "single-org-secret"
      }
    }
  }
}
```

**Switching Tenants:**
- Manual: Change config file, restart Claude
- Programmatic: Use bearer token mode (requires app re-auth)

**Limitations:**
- ❌ No built-in tenant context
- ❌ No caching across tenants
- ❌ Each tenant switch requires full re-initialization

---

#### Integration Foundry

**Configuration:**
```typescript
// One-time setup, manage unlimited tenants
const foundry = new XeroFoundryMCP({
  database: './tenants.db',
  encryptionKey: process.env.MCP_ENCRYPTION_KEY
});

// Register multiple tenants
await foundry.register_tenant({
  tenant_id: 'acme-au-001',
  xero_tenant_id: '...',
  tokens: { access_token: '...', refresh_token: '...' }
});

await foundry.register_tenant({
  tenant_id: 'acme-uk-002',
  xero_tenant_id: '...',
  tokens: { access_token: '...', refresh_token: '...' }
});
```

**Switching Tenants:**
```typescript
// Instant, in-memory context switch
await foundry.switch_tenant_context({ tenant_id: 'acme-au-001' });
// Now all calls use AU tenant's Chart of Accounts, Tax Rates, etc.

await foundry.switch_tenant_context({ tenant_id: 'acme-uk-002' });
// Switched to UK tenant context
```

**Advantages:**
- ✅ Tenant context cached (CoA, TaxRates, TrackingCategories)
- ✅ No re-initialization needed
- ✅ Isolated database storage per tenant
- ✅ Supports SaaS multi-tenant architectures

---

### 7. Documentation & Developer Experience

#### Official MCP

**Documentation:**
- ✅ Clear installation instructions
- ✅ Examples for Claude Desktop setup
- ⚠️ Limited troubleshooting guides
- ❌ No integration patterns/recipes

**Onboarding Time:**
- For AI users: 5 minutes (install, connect)
- For developers: 30+ minutes (understand limitations, workarounds)

**Learning Curve:**
- Steep: Must understand Xero API deeply
- No guidance on common pitfalls
- Trial-and-error for edge cases

---

#### Integration Foundry

**Documentation (Planned):**
- ✅ Installation & quick-start (< 30 min)
- ✅ Tool reference with examples
- ✅ Integration patterns ("How to sync invoices")
- ✅ Troubleshooting guide (with diagnostic codes)
- ✅ Video tutorials for common workflows
- ✅ Comparison guide (vs. official MCP)

**Onboarding Time:**
- For developers: 15-30 minutes
- First integration: < 2 hours (with validation)

**Learning Curve:**
- Gentle: Progressive verbosity educates as you use it
- Example recipes for 10+ common patterns
- AI-assisted debugging (LLM can parse diagnostics)

**Example Recipe: "SaaS Signup → Xero Connection"**
```markdown
## Pattern: Connect User's Xero Org During Signup

### Step 1: Initiate OAuth
```typescript
const authUrl = await foundry.initiate_xero_registration({
  redirect_uri: 'https://myapp.com/xero/callback'
});
// Show authUrl to user in signup flow
```

### Step 2: Handle Callback
```typescript
const result = await foundry.complete_xero_registration({
  code: req.query.code,
  state: req.query.state
});
// result.tenant_id, result.org_name
// Store tenant_id with user record
```

### Step 3: Pre-load Tenant Context
```typescript
await foundry.switch_tenant_context({ 
  tenant_id: result.tenant_id 
});
// Shadow state now cached (CoA, TaxRates)
```

### Step 4: Validate First Sync
```typescript
const validation = await foundry.validate_schema_match({
  tenant_id: result.tenant_id,
  entity_type: 'Invoice',
  payload: firstInvoice
});
// Show user any warnings before first sync
```
```

---

### 8. When to Use Which Tool

#### Use Official Xero MCP When:

1. **You're an end user** (not a developer) using Claude/ChatGPT
2. **You need simple queries** - "What's my cash flow?" "Show top customers"
3. **You want quick setup** - Install, config, go
4. **You don't need testing** - All operations are live
5. **You have one Xero org** - Multi-tenant is manual
6. **You trust AI to handle errors** - Claude can retry/adapt

**Example Persona:**
- **Emma**, Small Business Owner
- Uses Claude Desktop to check financials
- Asks: "Did my client pay Invoice #1234?"
- Needs: Fast, accurate answers from live Xero

---

#### Use Integration Foundry When:

1. **You're building a SaaS product** that integrates with Xero
2. **You need to test** - CI/CD, staging environments, QA
3. **You manage multiple Xero orgs** - Multi-tenant SaaS
4. **You want validation** - Catch errors before they reach Xero
5. **You need debugging tools** - Schema diffs, dry-runs, chaos testing
6. **You're in a regulated industry** - Audit trails, compliance scores

**Example Persona:**
- **Marcus**, SaaS Developer at InvoiceFlow
- Building Stripe → Xero sync for 500 customers
- Needs: Validate 1000 invoices/hour, test edge cases, monitor errors
- Uses: `dry_run_sync` in CI/CD, `diagnose_connection` for support tickets

---

### 9. Performance Benchmarks

#### Official MCP

| Operation | Latency | API Calls | Cache Hits |
|-----------|---------|-----------|------------|
| List 100 Invoices | ~800ms | 1 | 0% |
| Validate Invoice Schema | N/A | - | - |
| Create Invoice | ~600ms | 1 | 0% |
| Switch Tenant | ~15s | 3+ | 0% |

**Analysis:**
- Direct API calls (no caching)
- Every operation hits Xero
- Rate limits apply immediately

---

#### Integration Foundry (Estimated)

| Operation | Latency | API Calls | Cache Hits |
|-----------|---------|-----------|------------|
| List 100 Invoices (cached) | ~50ms | 0 | 100% |
| Validate Invoice Schema | ~150ms | 0 | 95% (CoA/TaxRates cached) |
| Dry-Run Create Invoice | ~80ms | 0 | 100% (shadow state) |
| Switch Tenant (cached) | ~10ms | 0 | 100% |

**Analysis:**
- Shadow state reduces API calls by 80-95%
- Validation happens offline (no Xero API hit)
- Tenant switching is instant
- Trade-off: Initial cache load (~2s per tenant)

**Cost Savings Example:**
- SaaS with 100 tenants
- Each validates 50 invoices/day
- Official MCP: 5,000 API calls/day
- Foundry: ~250 API calls/day (95% reduction)

---

### 10. Pricing & Licensing

#### Official Xero MCP
- **License:** MIT (Open Source)
- **Cost:** Free
- **Support:** Community (GitHub issues)
- **Hosting:** Self-hosted only

---

#### Integration Foundry (Proposed)
- **License:** MIT (Open Source)
- **Cost:** Free (self-hosted)
- **Premium (Future):** 
  - Hosted validation API ($99/mo for 10,000 validations)
  - Premium support ($299/mo)
  - Enterprise features (SSO, audit logs) - Custom pricing
- **Support:** 
  - Community (GitHub issues)
  - Premium: Slack channel + prioritized fixes

---

## Summary Matrix

| Feature | Official MCP | Integration Foundry |
|---------|--------------|---------------------|
| **Primary Use Case** | AI-powered Xero queries | SaaS integration development |
| **Target Audience** | End users + AI | Developers + QA engineers |
| **Testing Support** | ❌ Production only | ✅ Dry-run + chaos testing |
| **Multi-Tenant** | ⚠️ Basic | ✅ Advanced (cached context) |
| **Validation** | ❌ None | ✅ Schema + business rules |
| **Error Messages** | ⚠️ Raw Xero errors | ✅ Educational diagnostics |
| **CI/CD Ready** | ❌ | ✅ |
| **State Management** | ❌ Stateless | ✅ Shadow state caching |
| **API Call Reduction** | 0% | ~90% (via cache) |
| **Setup Complexity** | ✅ Simple | ⚠️ Moderate |
| **Documentation** | ⚠️ Basic | ✅ Comprehensive (planned) |
| **License** | MIT | MIT |
| **Maturity** | ✅ Stable (official) | 🚧 In development |

---

## Recommendation Framework

### Choose Official Xero MCP if:
- ✅ You're an end user (not building integrations)
- ✅ You need read-only queries via AI
- ✅ You want zero setup complexity
- ✅ Single Xero org is sufficient

### Choose Integration Foundry if:
- ✅ You're building a SaaS product
- ✅ You need automated testing
- ✅ You manage multiple Xero orgs
- ✅ You want to catch errors before production
- ✅ You need audit trails for compliance

### Use Both Together:
- **Development:** Foundry (for testing, validation, dry-runs)
- **End-User Features:** Official MCP (for AI chat features)
- **Example:** Your SaaS uses Foundry for background syncs, but offers "Ask AI about your books" powered by official MCP

---

## Migration Path

### From Official MCP → Integration Foundry

**1. Install Foundry alongside official MCP:**
```bash
npm install @xeroapi/integration-foundry
```

**2. Migrate tenant connections:**
```typescript
// Export from official MCP config
const tenants = [
  { id: 'tenant1', client_id: '...', client_secret: '...' }
];

// Import to Foundry
for (const tenant of tenants) {
  await foundry.register_tenant(tenant);
}
```

**3. Refactor integration tests:**
```typescript
// Before (manual testing)
test('invoice sync', async () => {
  const result = await xeroApi.createInvoice(invoice);
  expect(result.status).toBe(200);
});

// After (with Foundry)
test('invoice sync', async () => {
  // Step 1: Validate
  const validation = await foundry.validate_schema_match({
    entity_type: 'Invoice',
    payload: invoice
  });
  expect(validation.success).toBe(true);
  
  // Step 2: Dry run
  const dryRun = await foundry.dry_run_sync({
    resource: 'invoices',
    payloads: [invoice]
  });
  expect(dryRun.data.predicted_success).toBe(1);
  
  // Step 3: Actual sync (now with confidence)
  const result = await foundry.sync_invoices({
    invoices: [invoice]
  });
  expect(result.success).toBe(true);
});
```

**4. Gradual rollout:**
- Week 1: Use Foundry for validation only (keep official MCP for writes)
- Week 2: Enable dry-run testing in CI/CD
- Week 3: Switch write operations to Foundry
- Week 4: Full migration complete

---

## Conclusion

Both tools serve different purposes and can coexist:

- **Official Xero MCP**: Best-in-class for AI-powered Xero queries
- **Integration Foundry**: Best-in-class for SaaS integration development

**The future:** Integration Foundry doesn't replace the official MCP—it complements it by solving developer-specific problems that the official tool wasn't designed to address.
