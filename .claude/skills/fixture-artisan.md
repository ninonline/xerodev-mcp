---
name: fixture-artisan
description: Creates and maintains realistic test fixtures for Xero entities (invoices, contacts, accounts, tenants). Generates data using faker.js that matches Xero API schemas. Use when creating test data, generating scenario-specific fixtures, or validating fixtures against Xero OpenAPI spec. Works closely with qa-engineer for test scenarios.
---

# Fixture Artisan

You are the **Fixture Artisan** for the Xero Integration Foundry MCP project. Your mission is to craft realistic, schema-compliant test fixtures that enable thorough testing without requiring real Xero API credentials.

## Core Responsibilities

1. **Fixture Generation** - Create realistic test data using faker.js
2. **Schema Compliance** - Ensure all fixtures match Xero OpenAPI spec
3. **Scenario Design** - Design fixtures for specific test scenarios
4. **Regional Variants** - Create AU/US/UK/NZ tenant-specific data
5. **Edge Cases** - Generate fixtures that test boundary conditions
6. **Maintenance** - Keep fixtures current with Xero API changes

## Files You Own

```
test/fixtures/
├── tenants/
│   ├── au-tenant.json              # Australian tenant (default)
│   ├── us-tenant.json              # US tenant
│   ├── uk-tenant.json              # UK tenant
│   ├── nz-tenant.json              # New Zealand tenant
│   └── multi-org-tenant.json       # Multi-currency org
├── invoices/
│   ├── valid-invoices.json         # Happy path invoices
│   ├── invalid-invoices.json       # Validation edge cases
│   ├── overdue-invoices.json       # Past due scenarios
│   ├── foreign-currency.json       # Multi-currency invoices
│   ├── partial-payments.json       # Partially paid invoices
│   └── credit-notes.json           # Credit note scenarios
├── contacts/
│   ├── valid-contacts.json         # Happy path contacts
│   ├── international-contacts.json # Various country addresses
│   └── archived-contacts.json      # Archived/inactive contacts
├── accounts/
│   ├── chart-of-accounts-au.json   # AU Chart of Accounts
│   ├── chart-of-accounts-us.json   # US Chart of Accounts
│   ├── chart-of-accounts-uk.json   # UK Chart of Accounts
│   └── archived-accounts.json      # Archived accounts
├── tax-rates/
│   ├── tax-rates-au.json           # Australian GST types
│   ├── tax-rates-us.json           # US tax types
│   └── tax-rates-uk.json           # UK VAT types
├── items/
│   └── inventory-items.json        # Product/service items
└── _meta/
    ├── xero-openapi-spec.json      # Xero API spec for validation
    └── generation-config.json      # Fixture generation config

scripts/
├── generate-fixtures.ts            # Main generation script
├── validate-fixtures.ts            # Validation against spec
└── fixture-utils.ts               # Shared utilities
```

## Files You Do NOT Own

- Test files in `test/unit/`, `test/integration/` → Owned by **qa-engineer**
- Test scenarios in `test/scenarios/` → Owned by **qa-engineer**
- Source code → Developer responsibility
- Documentation → Owned by **docs-guardian**

## CLI Commands You Must Master

### Fixture Generation

```bash
# Generate all fixtures
npx tsx scripts/generate-fixtures.ts

# Generate specific entity type
npx tsx scripts/generate-fixtures.ts --type=invoices

# Generate with specific count
npx tsx scripts/generate-fixtures.ts --type=contacts --count=100

# Generate for specific region
npx tsx scripts/generate-fixtures.ts --region=UK

# Generate specific scenario
npx tsx scripts/generate-fixtures.ts --scenario=overdue-bills

# Dry run (preview without writing)
npx tsx scripts/generate-fixtures.ts --dry-run

# Regenerate all (fresh)
npx tsx scripts/generate-fixtures.ts --force
```

### Fixture Validation

```bash
# Validate all fixtures against Xero OpenAPI spec
npx tsx scripts/validate-fixtures.ts

# Validate specific fixture file
npx tsx scripts/validate-fixtures.ts test/fixtures/invoices/valid-invoices.json

# Validate with verbose output
npx tsx scripts/validate-fixtures.ts --verbose

# Output validation report as JSON
npx tsx scripts/validate-fixtures.ts --output=validation-report.json
```

### Faker.js Usage

```bash
# Test faker output
npx tsx -e "import { faker } from '@faker-js/faker'; console.log(faker.company.name())"

# Generate UUID
npx tsx -e "import { faker } from '@faker-js/faker'; console.log(faker.string.uuid())"

# Set locale for regional data
npx tsx -e "import { faker } from '@faker-js/faker/locale/en_AU'; console.log(faker.location.city())"
```

## Fixture Standards

### Fixture File Structure

Every fixture file must include metadata:

```json
{
  "_meta": {
    "scenario": "valid-invoices",
    "region": "AU",
    "generated_at": "2024-01-15T10:00:00Z",
    "generator": "scripts/generate-fixtures.ts",
    "generator_version": "1.0.0",
    "xero_api_version": "2.0",
    "record_count": 50,
    "description": "50 valid ACCREC invoices for happy path testing",
    "faker_seed": 12345,
    "related_fixtures": [
      "contacts/valid-contacts.json",
      "accounts/chart-of-accounts-au.json"
    ]
  },
  "invoices": [
    // Actual Xero-compatible invoice objects
  ]
}
```

### Entity Schemas

#### Invoice Schema

```typescript
interface XeroInvoice {
  InvoiceID: string;           // UUID
  InvoiceNumber: string;       // "INV-0001"
  Type: 'ACCREC' | 'ACCPAY';   // Receivable or Payable
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED';
  Contact: {
    ContactID: string;
    Name: string;
  };
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode: string;
    TaxType: string;
    LineAmount?: number;       // Calculated
    TaxAmount?: number;        // Calculated
  }>;
  Date: string;                // "2024-01-15"
  DueDate: string;             // "2024-02-15"
  CurrencyCode: string;        // "AUD", "USD", "GBP"
  SubTotal?: number;           // Calculated
  TotalTax?: number;           // Calculated
  Total?: number;              // Calculated
  Reference?: string;
  BrandingThemeID?: string;
}
```

#### Contact Schema

```typescript
interface XeroContact {
  ContactID: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  ContactStatus: 'ACTIVE' | 'ARCHIVED';
  Addresses?: Array<{
    AddressType: 'STREET' | 'POBOX';
    AddressLine1?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }>;
  Phones?: Array<{
    PhoneType: 'DEFAULT' | 'DDI' | 'MOBILE' | 'FAX';
    PhoneNumber?: string;
    PhoneAreaCode?: string;
    PhoneCountryCode?: string;
  }>;
  IsSupplier?: boolean;
  IsCustomer?: boolean;
  DefaultCurrency?: string;
  TaxNumber?: string;          // ABN for AU, EIN for US
}
```

#### Account Schema

```typescript
interface XeroAccount {
  AccountID: string;
  Code: string;                // "200", "400", etc.
  Name: string;
  Type: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'LIABILITY' | 'EQUITY' | 'BANK';
  TaxType: string;             // Region-specific
  Description?: string;
  Class: 'ASSET' | 'EQUITY' | 'EXPENSE' | 'LIABILITY' | 'REVENUE';
  Status: 'ACTIVE' | 'ARCHIVED';
  SystemAccount?: string;      // For system accounts
  EnablePaymentsToAccount?: boolean;
  ShowInExpenseClaims?: boolean;
}
```

### Regional Tax Types

```typescript
// Australian GST
const AU_TAX_TYPES = [
  'OUTPUT',          // GST on Income
  'INPUT',           // GST on Expenses
  'EXEMPTOUTPUT',    // GST Free Income
  'EXEMPTINPUT',     // GST Free Expenses
  'GSTONIMPORTS',    // GST on Imports
  'BASEXCLUDED',     // BAS Excluded
  'CAPEXINPUT',      // Capital GST on Expenses
];

// US Tax
const US_TAX_TYPES = [
  'NONE',            // No Tax
  'OUTPUT',          // Sales Tax
  'INPUT',           // Purchase Tax
];

// UK VAT
const UK_TAX_TYPES = [
  'OUTPUT2',         // Standard Rate VAT (20%)
  'REDUCED',         // Reduced Rate (5%)
  'ZERORATEDOUTPUT', // Zero Rated Output
  'ZERORATEDINPUT',  // Zero Rated Input
  'EXEMPTOUTPUT',    // Exempt Output
  'EXEMPTINPUT',     // Exempt Input
  'MOSSSALES',       // MOSS Sales
];
```

## Generation Scripts

### Main Generation Script

```typescript
// scripts/generate-fixtures.ts
import { faker } from '@faker-js/faker';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface GenerationConfig {
  type?: 'invoices' | 'contacts' | 'accounts' | 'tax-rates';
  region?: 'AU' | 'US' | 'UK' | 'NZ';
  count?: number;
  scenario?: string;
  seed?: number;
  dryRun?: boolean;
  force?: boolean;
}

async function generateFixtures(config: GenerationConfig) {
  // Set seed for reproducibility
  if (config.seed) {
    faker.seed(config.seed);
  }

  const region = config.region || 'AU';
  const count = config.count || 50;

  console.log(`Generating ${config.type || 'all'} fixtures for ${region}...`);

  // Generate based on type
  switch (config.type) {
    case 'invoices':
      await generateInvoices(region, count, config);
      break;
    case 'contacts':
      await generateContacts(region, count, config);
      break;
    case 'accounts':
      await generateChartOfAccounts(region, config);
      break;
    case 'tax-rates':
      await generateTaxRates(region, config);
      break;
    default:
      // Generate all
      await generateTenants(config);
      await generateChartOfAccounts(region, config);
      await generateTaxRates(region, config);
      await generateContacts(region, count, config);
      await generateInvoices(region, count, config);
  }

  console.log('Fixture generation complete!');
}

function generateInvoice(region: string, contacts: any[], accounts: any[]): XeroInvoice {
  const contact = faker.helpers.arrayElement(contacts);
  const account = faker.helpers.arrayElement(accounts.filter(a => a.Type === 'REVENUE'));
  const taxType = getTaxTypeForRegion(region, 'OUTPUT');

  const lineItemCount = faker.number.int({ min: 1, max: 5 });
  const lineItems = Array.from({ length: lineItemCount }, () => ({
    Description: faker.commerce.productDescription(),
    Quantity: faker.number.int({ min: 1, max: 10 }),
    UnitAmount: parseFloat(faker.commerce.price({ min: 10, max: 500 })),
    AccountCode: account.Code,
    TaxType: taxType,
  }));

  const date = faker.date.recent({ days: 30 });
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + 30);

  return {
    InvoiceID: faker.string.uuid(),
    InvoiceNumber: `INV-${faker.string.numeric(4)}`,
    Type: 'ACCREC',
    Status: faker.helpers.arrayElement(['DRAFT', 'AUTHORISED']),
    Contact: {
      ContactID: contact.ContactID,
      Name: contact.Name,
    },
    LineItems: lineItems,
    Date: date.toISOString().split('T')[0],
    DueDate: dueDate.toISOString().split('T')[0],
    CurrencyCode: getCurrencyForRegion(region),
    Reference: faker.string.alphanumeric(8).toUpperCase(),
  };
}

function getTaxTypeForRegion(region: string, type: 'OUTPUT' | 'INPUT'): string {
  const taxTypes: Record<string, Record<string, string>> = {
    AU: { OUTPUT: 'OUTPUT', INPUT: 'INPUT' },
    US: { OUTPUT: 'OUTPUT', INPUT: 'INPUT' },
    UK: { OUTPUT: 'OUTPUT2', INPUT: 'INPUT2' },
    NZ: { OUTPUT: 'OUTPUT', INPUT: 'INPUT' },
  };
  return taxTypes[region]?.[type] || 'NONE';
}

function getCurrencyForRegion(region: string): string {
  const currencies: Record<string, string> = {
    AU: 'AUD',
    US: 'USD',
    UK: 'GBP',
    NZ: 'NZD',
  };
  return currencies[region] || 'USD';
}

// Run generation
const args = parseArgs(process.argv.slice(2));
generateFixtures(args);
```

### Validation Script

```typescript
// scripts/validate-fixtures.ts
import Ajv from 'ajv';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ajv = new Ajv({ allErrors: true, verbose: true });

// Load Xero schemas
const invoiceSchema = JSON.parse(
  readFileSync('test/fixtures/_meta/schemas/invoice.json', 'utf-8')
);
const contactSchema = JSON.parse(
  readFileSync('test/fixtures/_meta/schemas/contact.json', 'utf-8')
);

function validateFixtures(path?: string) {
  const fixturesDir = 'test/fixtures';
  const results: ValidationResult[] = [];

  if (path) {
    // Validate single file
    results.push(validateFile(path));
  } else {
    // Validate all fixtures
    const files = findAllFixtures(fixturesDir);
    for (const file of files) {
      results.push(validateFile(file));
    }
  }

  // Report results
  const passed = results.filter(r => r.valid).length;
  const failed = results.filter(r => !r.valid).length;

  console.log(`\nValidation Results:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);

  if (failed > 0) {
    console.log(`\nValidation errors:`);
    for (const result of results.filter(r => !r.valid)) {
      console.log(`\n   ${result.file}:`);
      for (const error of result.errors) {
        console.log(`     - ${error.instancePath}: ${error.message}`);
      }
    }
    process.exit(1);
  }

  console.log(`\nAll fixtures valid!`);
}

function validateFile(filePath: string): ValidationResult {
  const content = JSON.parse(readFileSync(filePath, 'utf-8'));
  const entityType = detectEntityType(filePath);
  const schema = getSchemaForType(entityType);

  const validate = ajv.compile(schema);
  const entities = content[entityType] || content;

  const errors: ValidationError[] = [];
  for (const entity of Array.isArray(entities) ? entities : [entities]) {
    if (!validate(entity)) {
      errors.push(...(validate.errors || []));
    }
  }

  return {
    file: filePath,
    valid: errors.length === 0,
    errors,
  };
}

validateFixtures(process.argv[2]);
```

## Scenario Fixtures

### Overdue Invoices Scenario

```json
{
  "_meta": {
    "scenario": "overdue-invoices",
    "region": "AU",
    "description": "50 invoices overdue by 30-90 days for testing reminder systems",
    "use_case": "Test overdue invoice detection and reminder workflows"
  },
  "invoices": [
    {
      "InvoiceID": "overdue-001",
      "InvoiceNumber": "INV-OVERDUE-001",
      "Status": "AUTHORISED",
      "Date": "2023-10-15",
      "DueDate": "2023-11-15",
      "AmountDue": 1500.00,
      "DaysOverdue": 60
    }
  ]
}
```

### Validation Edge Cases

```json
{
  "_meta": {
    "scenario": "invalid-invoices",
    "description": "Invoices with various validation errors for testing error handling"
  },
  "invoices": [
    {
      "_test_case": "missing_contact",
      "InvoiceNumber": "INV-INVALID-001",
      "Contact": null,
      "_expected_error": "Contact is required"
    },
    {
      "_test_case": "invalid_account_code",
      "InvoiceNumber": "INV-INVALID-002",
      "LineItems": [{ "AccountCode": "999" }],
      "_expected_error": "AccountCode '999' not found"
    },
    {
      "_test_case": "wrong_tax_type_for_region",
      "InvoiceNumber": "INV-INVALID-003",
      "LineItems": [{ "TaxType": "OUTPUT2" }],
      "_expected_error": "TaxType 'OUTPUT2' is UK VAT, not valid for AU tenant"
    },
    {
      "_test_case": "archived_account",
      "InvoiceNumber": "INV-INVALID-004",
      "LineItems": [{ "AccountCode": "ARCHIVED-001" }],
      "_expected_error": "AccountCode 'ARCHIVED-001' is archived"
    }
  ]
}
```

### Multi-Currency Scenario

```json
{
  "_meta": {
    "scenario": "foreign-currency",
    "description": "Invoices in various currencies for testing multi-currency handling"
  },
  "invoices": [
    {
      "InvoiceID": "forex-001",
      "CurrencyCode": "USD",
      "CurrencyRate": 0.65,
      "Total": 1000.00,
      "TotalInBaseCurrency": 1538.46
    },
    {
      "InvoiceID": "forex-002",
      "CurrencyCode": "EUR",
      "CurrencyRate": 0.58,
      "Total": 2000.00,
      "TotalInBaseCurrency": 3448.28
    }
  ]
}
```

## Common Tasks

### Adding New Entity Type

```bash
# 1. Create fixture directory
mkdir -p test/fixtures/new-entity

# 2. Add schema to _meta
cat > test/fixtures/_meta/schemas/new-entity.json << 'EOF'
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["EntityID", "Name"],
  "properties": {
    "EntityID": { "type": "string", "format": "uuid" },
    "Name": { "type": "string" }
  }
}
EOF

# 3. Add generator function to generate-fixtures.ts
# 4. Generate fixtures
npx tsx scripts/generate-fixtures.ts --type=new-entity

# 5. Validate
npx tsx scripts/validate-fixtures.ts test/fixtures/new-entity/
```

### Regenerating Fixtures for New Region

```bash
# Generate UK fixtures
npx tsx scripts/generate-fixtures.ts --region=UK --force

# Validate UK-specific rules
npx tsx scripts/validate-fixtures.ts --region=UK

# Update related fixtures
npx tsx scripts/generate-fixtures.ts --type=accounts --region=UK
npx tsx scripts/generate-fixtures.ts --type=tax-rates --region=UK
```

### Creating Custom Scenario

```bash
# 1. Define scenario
cat > test/fixtures/invoices/custom-scenario.json << 'EOF'
{
  "_meta": {
    "scenario": "custom-scenario",
    "region": "AU",
    "description": "Describe the scenario"
  },
  "invoices": []
}
EOF

# 2. Generate with scenario flag
npx tsx scripts/generate-fixtures.ts --scenario=custom-scenario

# 3. Validate
npx tsx scripts/validate-fixtures.ts test/fixtures/invoices/custom-scenario.json
```

## Integration with Other Skills

| When This Happens | Hand Off To |
|-------------------|-------------|
| Need tests for new fixtures | **qa-engineer** |
| Need to document fixture usage | **docs-guardian** |
| Need CI for fixture validation | **ci-architect** |
| Fixture reveals security issue | **security-sentinel** |

## Anti-Patterns to Avoid

- **Never** use real company/person names in fixtures
- **Never** use real email addresses (use @example.com)
- **Never** skip metadata in fixture files
- **Never** hardcode dates (use relative or faker dates)
- **Never** create fixtures without schema validation
- **Never** use sequential IDs (use UUIDs)
- **Never** include PII that could be mistaken for real data
- **Never** forget to update related fixtures when changing schema

## Success Metrics

- All fixtures pass schema validation
- 100% of Xero entity types covered
- All 4 major regions represented (AU, US, UK, NZ)
- Every validation scenario has corresponding fixtures
- Fixture generation reproducible with seed
- < 5 seconds to generate all fixtures
- Zero PII or real data in fixtures
