#!/usr/bin/env tsx
/**
 * Fixture Validation Script
 *
 * Validates that test fixtures conform to expected schemas and contain
 * all required data for the xerodev-mcp server to function correctly.
 *
 * Supports multi-tenant validation for AU, UK, and US regions.
 *
 * Usage:
 *   npm run validate:fixtures
 *   npx tsx scripts/validate-fixtures.ts
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '..', 'test', 'fixtures');

// Region-specific tax types
const REGION_TAX_TYPES: Record<string, string[]> = {
  AU: ['OUTPUT', 'INPUT', 'EXEMPTOUTPUT', 'EXEMPTINPUT', 'BASEXCLUDED', 'NONE'],
  UK: ['OUTPUT2', 'INPUT2', 'ZERORATEDOUTPUT', 'ZERORATEDINPUT', 'EXEMPTOUTPUT', 'EXEMPTINPUT', 'RROUTPUT', 'RRINPUT', 'NONE'],
  US: ['TAX', 'EXEMPTOUTPUT', 'NONE'],
};

// Schema definitions
const AddressSchema = z.object({
  type: z.string(),
  line1: z.string(),
  city: z.string(),
  region: z.string(),
  postal_code: z.string(),
  country: z.string(),
});

const PhoneSchema = z.object({
  type: z.string(),
  number: z.string(),
});

const ContactSchema = z.object({
  contact_id: z.string(),
  name: z.string(),
  email: z.string().email().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  is_customer: z.boolean(),
  is_supplier: z.boolean(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  addresses: z.array(AddressSchema).optional(),
  phones: z.array(PhoneSchema).optional(),
});

const AccountSchema = z.object({
  account_id: z.string(),
  code: z.string(),
  name: z.string(),
  type: z.enum(['REVENUE', 'EXPENSE', 'BANK', 'CURRENT', 'FIXED', 'LIABILITY', 'EQUITY']),
  tax_type: z.string().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  description: z.string().optional(),
});

const TaxRateSchema = z.object({
  name: z.string(),
  tax_type: z.string(),
  rate: z.number(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  description: z.string().optional(),
});

const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unit_amount: z.number(),
  account_code: z.string(),
  tax_type: z.string().optional(),
});

const InvoiceSchema = z.object({
  invoice_id: z.string(),
  type: z.enum(['ACCREC', 'ACCPAY']),
  contact: z.object({
    contact_id: z.string(),
    name: z.string().optional(),
  }),
  date: z.string(),
  due_date: z.string(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED']),
  line_amount_types: z.enum(['Exclusive', 'Inclusive', 'NoTax']),
  line_items: z.array(LineItemSchema),
  currency_code: z.string(),
  sub_total: z.number().optional(),
  total_tax: z.number().optional(),
  total: z.number().optional(),
});

const QuoteSchema = z.object({
  quote_id: z.string(),
  quote_number: z.string(),
  contact: z.object({
    contact_id: z.string(),
    name: z.string().optional(),
  }),
  date: z.string(),
  expiry_date: z.string(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'INVOICED']),
  line_amount_types: z.enum(['Exclusive', 'Inclusive', 'NoTax']),
  line_items: z.array(LineItemSchema),
  currency_code: z.string(),
  sub_total: z.number().optional(),
  total_tax: z.number().optional(),
  total: z.number().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
});

const CreditNoteSchema = z.object({
  credit_note_id: z.string(),
  credit_note_number: z.string(),
  type: z.enum(['ACCRECCREDIT', 'ACCPAYCREDIT']),
  contact: z.object({
    contact_id: z.string(),
    name: z.string().optional(),
  }),
  date: z.string(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED']),
  line_amount_types: z.enum(['Exclusive', 'Inclusive', 'NoTax']),
  line_items: z.array(LineItemSchema),
  currency_code: z.string(),
  sub_total: z.number().optional(),
  total_tax: z.number().optional(),
  total: z.number().optional(),
  remaining_credit: z.number().optional(),
  reference: z.string().optional(),
});

const PaymentSchema = z.object({
  payment_id: z.string(),
  invoice: z.object({
    invoice_id: z.string(),
  }),
  account: z.object({
    account_id: z.string(),
    name: z.string().optional(),
  }),
  date: z.string(),
  amount: z.number().positive(),
  status: z.enum(['AUTHORISED', 'DELETED']),
  reference: z.string().optional(),
  currency_code: z.string(),
});

const BankTransactionSchema = z.object({
  bank_transaction_id: z.string(),
  type: z.enum(['SPEND', 'RECEIVE']),
  contact: z.object({
    contact_id: z.string(),
    name: z.string().optional(),
  }),
  bank_account: z.object({
    account_id: z.string(),
    name: z.string().optional(),
  }),
  date: z.string(),
  status: z.enum(['DRAFT', 'AUTHORISED', 'DELETED']),
  line_amount_types: z.enum(['Exclusive', 'Inclusive', 'NoTax']),
  line_items: z.array(LineItemSchema),
  sub_total: z.number().optional(),
  total_tax: z.number().optional(),
  total: z.number().optional(),
  currency_code: z.string(),
  reference: z.string().optional(),
});

const TenantSchema = z.object({
  tenant_id: z.string(),
  xero_tenant_id: z.string(),
  org_name: z.string(),
  region: z.string(),
  currency: z.string(),
  tax_system: z.string(),
  granted_scopes: z.array(z.string()),
  connection_status: z.enum(['active', 'expired', 'revoked']),
});

// Validation results
interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  counts?: Record<string, number>;
}

interface TenantInfo {
  tenantId: string;
  region: string;
  tenantFile: string;
  accountsFile: string;
  contactsFile: string;
  invoicesFile: string;
  quotesFile: string;
  creditNotesFile: string;
  paymentsFile: string;
  bankTransactionsFile: string;
}

const results: ValidationResult[] = [];

function discoverTenants(): TenantInfo[] {
  const tenants: TenantInfo[] = [];
  const tenantsDir = join(FIXTURES_PATH, 'tenants');

  if (!existsSync(tenantsDir)) {
    return tenants;
  }

  const tenantFiles = readdirSync(tenantsDir).filter(f => f.endsWith('.json'));

  for (const tenantFile of tenantFiles) {
    try {
      const tenantPath = join(tenantsDir, tenantFile);
      const tenant = JSON.parse(readFileSync(tenantPath, 'utf-8'));
      const tenantId = tenant.tenant_id;
      const region = tenant.region;

      // Derive fixture file names based on tenant file prefix
      const prefix = tenantFile.replace('.json', '').replace('-gst', '').replace('-vat', '').replace('-startup', '');

      tenants.push({
        tenantId,
        region,
        tenantFile: join('tenants', tenantFile),
        accountsFile: findFixtureFile('accounts', tenantId, prefix),
        contactsFile: findFixtureFile('contacts', tenantId, prefix),
        invoicesFile: findFixtureFile('invoices', tenantId, prefix),
        quotesFile: findFixtureFile('quotes', tenantId, prefix),
        creditNotesFile: findFixtureFile('credit-notes', tenantId, prefix),
        paymentsFile: findFixtureFile('payments', tenantId, prefix),
        bankTransactionsFile: findFixtureFile('bank-transactions', tenantId, prefix),
      });
    } catch {
      // Skip invalid tenant files
    }
  }

  return tenants;
}

function findFixtureFile(category: string, tenantId: string, prefix: string): string {
  const dir = join(FIXTURES_PATH, category);
  if (!existsSync(dir)) {
    return '';
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));

  // Try to find file matching the tenant
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
      if (data._meta?.tenant_id === tenantId) {
        return join(category, file);
      }
    } catch {
      // Skip invalid files
    }
  }

  return '';
}

function validateFile<T>(
  path: string,
  schema: z.ZodType<T>,
  itemsKey?: string,
  itemSchema?: z.ZodType<any>
): ValidationResult {
  const result: ValidationResult = {
    file: path.replace(FIXTURES_PATH + '/', ''),
    valid: true,
    errors: [],
    warnings: [],
  };

  const fullPath = path.startsWith(FIXTURES_PATH) ? path : join(FIXTURES_PATH, path);

  if (!existsSync(fullPath)) {
    result.valid = false;
    result.errors.push('File does not exist');
    return result;
  }

  let data: any;
  try {
    data = JSON.parse(readFileSync(fullPath, 'utf-8'));
  } catch (error) {
    result.valid = false;
    result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }

  // Validate root structure
  if (itemsKey && itemSchema) {
    const items = data[itemsKey];
    if (!Array.isArray(items)) {
      result.valid = false;
      result.errors.push(`Missing or invalid '${itemsKey}' array`);
      return result;
    }

    result.counts = { [itemsKey]: items.length };

    // Validate each item
    items.forEach((item: any, index: number) => {
      const itemResult = itemSchema.safeParse(item);
      if (!itemResult.success) {
        result.valid = false;
        result.errors.push(
          `${itemsKey}[${index}]: ${itemResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
    });
  } else {
    const parseResult = schema.safeParse(data);
    if (!parseResult.success) {
      result.valid = false;
      result.errors.push(
        parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
  }

  return result;
}

function validateTenantCrossReferences(tenant: TenantInfo): ValidationResult {
  const result: ValidationResult = {
    file: `${tenant.tenantId} cross-references`,
    valid: true,
    errors: [],
    warnings: [],
  };

  // Load data
  let accounts: any[] = [];
  let contacts: any[] = [];
  let invoices: any[] = [];
  let quotes: any[] = [];
  let creditNotes: any[] = [];
  let payments: any[] = [];
  let bankTransactions: any[] = [];

  try {
    if (tenant.accountsFile) {
      const data = JSON.parse(readFileSync(join(FIXTURES_PATH, tenant.accountsFile), 'utf-8'));
      accounts = data.accounts || [];
    }
  } catch {
    result.errors.push('Cannot load accounts fixture');
  }

  try {
    if (tenant.contactsFile) {
      const data = JSON.parse(readFileSync(join(FIXTURES_PATH, tenant.contactsFile), 'utf-8'));
      contacts = data.contacts || [];
    }
  } catch {
    result.errors.push('Cannot load contacts fixture');
  }

  try {
    if (tenant.invoicesFile) {
      const data = JSON.parse(readFileSync(join(FIXTURES_PATH, tenant.invoicesFile), 'utf-8'));
      invoices = data.invoices || [];
    }
  } catch {
    result.errors.push('Cannot load invoices fixture');
  }

  try {
    if (tenant.quotesFile) {
      const data = JSON.parse(readFileSync(join(FIXTURES_PATH, tenant.quotesFile), 'utf-8'));
      quotes = data.quotes || [];
    }
  } catch {
    result.warnings.push('Cannot load quotes fixture');
  }

  try {
    if (tenant.creditNotesFile) {
      const data = JSON.parse(readFileSync(join(FIXTURES_PATH, tenant.creditNotesFile), 'utf-8'));
      creditNotes = data.credit_notes || [];
    }
  } catch {
    result.warnings.push('Cannot load credit notes fixture');
  }

  try {
    if (tenant.paymentsFile) {
      const data = JSON.parse(readFileSync(join(FIXTURES_PATH, tenant.paymentsFile), 'utf-8'));
      payments = data.payments || [];
    }
  } catch {
    result.warnings.push('Cannot load payments fixture');
  }

  try {
    if (tenant.bankTransactionsFile) {
      const data = JSON.parse(readFileSync(join(FIXTURES_PATH, tenant.bankTransactionsFile), 'utf-8'));
      bankTransactions = data.bank_transactions || [];
    }
  } catch {
    result.warnings.push('Cannot load bank transactions fixture');
  }

  if (result.errors.length > 0) {
    result.valid = false;
    return result;
  }

  const accountCodes = new Set(accounts.map(a => a.code));
  const accountIds = new Set(accounts.map(a => a.account_id));
  const contactIds = new Set(contacts.map(c => c.contact_id));
  const invoiceIds = new Set(invoices.map(i => i.invoice_id));
  const validTaxTypes = REGION_TAX_TYPES[tenant.region] || [];

  // Validate invoice references
  invoices.forEach((invoice, index) => {
    if (!contactIds.has(invoice.contact.contact_id)) {
      result.errors.push(`invoices[${index}]: Contact '${invoice.contact.contact_id}' not found`);
    }

    invoice.line_items.forEach((item: any, itemIndex: number) => {
      if (!accountCodes.has(item.account_code)) {
        result.errors.push(`invoices[${index}].line_items[${itemIndex}]: AccountCode '${item.account_code}' not found`);
      }
      if (item.tax_type && !validTaxTypes.includes(item.tax_type)) {
        result.warnings.push(`invoices[${index}].line_items[${itemIndex}]: TaxType '${item.tax_type}' may be invalid for ${tenant.region}`);
      }
    });
  });

  // Validate quote references
  quotes.forEach((quote, index) => {
    if (!contactIds.has(quote.contact.contact_id)) {
      result.errors.push(`quotes[${index}]: Contact '${quote.contact.contact_id}' not found`);
    }

    quote.line_items.forEach((item: any, itemIndex: number) => {
      if (!accountCodes.has(item.account_code)) {
        result.errors.push(`quotes[${index}].line_items[${itemIndex}]: AccountCode '${item.account_code}' not found`);
      }
    });
  });

  // Validate credit note references
  creditNotes.forEach((cn, index) => {
    if (!contactIds.has(cn.contact.contact_id)) {
      result.errors.push(`credit_notes[${index}]: Contact '${cn.contact.contact_id}' not found`);
    }

    cn.line_items.forEach((item: any, itemIndex: number) => {
      if (!accountCodes.has(item.account_code)) {
        result.errors.push(`credit_notes[${index}].line_items[${itemIndex}]: AccountCode '${item.account_code}' not found`);
      }
    });
  });

  // Validate payment references
  payments.forEach((payment, index) => {
    if (!invoiceIds.has(payment.invoice.invoice_id)) {
      result.warnings.push(`payments[${index}]: Invoice '${payment.invoice.invoice_id}' not found`);
    }
    if (!accountIds.has(payment.account.account_id)) {
      result.errors.push(`payments[${index}]: Account '${payment.account.account_id}' not found`);
    }
  });

  // Validate bank transaction references
  bankTransactions.forEach((bt, index) => {
    if (!contactIds.has(bt.contact.contact_id)) {
      result.errors.push(`bank_transactions[${index}]: Contact '${bt.contact.contact_id}' not found`);
    }
    if (!accountIds.has(bt.bank_account.account_id)) {
      result.errors.push(`bank_transactions[${index}]: Bank account '${bt.bank_account.account_id}' not found`);
    }

    bt.line_items.forEach((item: any, itemIndex: number) => {
      if (!accountCodes.has(item.account_code)) {
        result.errors.push(`bank_transactions[${index}].line_items[${itemIndex}]: AccountCode '${item.account_code}' not found`);
      }
    });
  });

  // Check for required data
  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE');
  const revenueAccounts = activeAccounts.filter(a => a.type === 'REVENUE');
  const bankAccounts = activeAccounts.filter(a => a.type === 'BANK');
  const activeContacts = contacts.filter(c => c.status === 'ACTIVE');
  const customerContacts = activeContacts.filter(c => c.is_customer);

  if (revenueAccounts.length === 0) {
    result.warnings.push('No active REVENUE accounts found');
  }

  if (bankAccounts.length === 0) {
    result.warnings.push('No BANK accounts found');
  }

  if (customerContacts.length === 0) {
    result.warnings.push('No active customer contacts found');
  }

  // Check for archived items (for testing)
  const archivedAccounts = accounts.filter(a => a.status === 'ARCHIVED');
  const archivedContacts = contacts.filter(c => c.status === 'ARCHIVED');

  if (archivedAccounts.length === 0) {
    result.warnings.push('No archived accounts found (needed for testing)');
  }

  if (archivedContacts.length === 0) {
    result.warnings.push('No archived contacts found (needed for testing)');
  }

  // Check for AUTHORISED invoices (needed for payment tests)
  const authorisedInvoices = invoices.filter(i => i.status === 'AUTHORISED');
  if (authorisedInvoices.length === 0) {
    result.warnings.push('No AUTHORISED invoices found (needed for payment tests)');
  }

  result.valid = result.errors.length === 0;
  return result;
}

function main() {
  console.log('Validating test fixtures...\n');

  const tenants = discoverTenants();

  if (tenants.length === 0) {
    console.log('\x1b[31mNo tenant fixtures found!\x1b[0m');
    process.exit(1);
  }

  console.log(`Found ${tenants.length} tenant(s): ${tenants.map(t => `${t.tenantId} (${t.region})`).join(', ')}\n`);

  for (const tenant of tenants) {
    console.log(`\n=== Validating ${tenant.tenantId} (${tenant.region}) ===\n`);

    // Validate tenant file
    results.push(validateFile(
      join(FIXTURES_PATH, tenant.tenantFile),
      TenantSchema
    ));

    // Validate accounts
    if (tenant.accountsFile) {
      results.push(validateFile(
        join(FIXTURES_PATH, tenant.accountsFile),
        z.object({
          _meta: z.any().optional(),
          accounts: z.array(AccountSchema),
          tax_rates: z.array(TaxRateSchema),
        }),
        'accounts',
        AccountSchema
      ));
    }

    // Validate contacts
    if (tenant.contactsFile) {
      results.push(validateFile(
        join(FIXTURES_PATH, tenant.contactsFile),
        z.object({ _meta: z.any().optional(), contacts: z.array(ContactSchema) }),
        'contacts',
        ContactSchema
      ));
    }

    // Validate invoices
    if (tenant.invoicesFile) {
      results.push(validateFile(
        join(FIXTURES_PATH, tenant.invoicesFile),
        z.object({ _meta: z.any().optional(), invoices: z.array(InvoiceSchema) }),
        'invoices',
        InvoiceSchema
      ));
    }

    // Validate quotes
    if (tenant.quotesFile) {
      results.push(validateFile(
        join(FIXTURES_PATH, tenant.quotesFile),
        z.object({ _meta: z.any().optional(), quotes: z.array(QuoteSchema) }),
        'quotes',
        QuoteSchema
      ));
    }

    // Validate credit notes
    if (tenant.creditNotesFile) {
      results.push(validateFile(
        join(FIXTURES_PATH, tenant.creditNotesFile),
        z.object({ _meta: z.any().optional(), credit_notes: z.array(CreditNoteSchema) }),
        'credit_notes',
        CreditNoteSchema
      ));
    }

    // Validate payments
    if (tenant.paymentsFile) {
      results.push(validateFile(
        join(FIXTURES_PATH, tenant.paymentsFile),
        z.object({ _meta: z.any().optional(), payments: z.array(PaymentSchema) }),
        'payments',
        PaymentSchema
      ));
    }

    // Validate bank transactions
    if (tenant.bankTransactionsFile) {
      results.push(validateFile(
        join(FIXTURES_PATH, tenant.bankTransactionsFile),
        z.object({ _meta: z.any().optional(), bank_transactions: z.array(BankTransactionSchema) }),
        'bank_transactions',
        BankTransactionSchema
      ));
    }

    // Validate cross-references
    results.push(validateTenantCrossReferences(tenant));
  }

  // Print results
  console.log('\n=== Validation Results ===\n');

  let hasErrors = false;

  results.forEach(result => {
    const status = result.valid ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m';
    console.log(`${status}  ${result.file}`);

    if (result.counts) {
      Object.entries(result.counts).forEach(([key, count]) => {
        console.log(`        ${count} ${key}`);
      });
    }

    result.errors.forEach(err => {
      console.log(`        \x1b[31m✗ ${err}\x1b[0m`);
    });

    result.warnings.forEach(warn => {
      console.log(`        \x1b[33m⚠ ${warn}\x1b[0m`);
    });

    if (!result.valid) {
      hasErrors = true;
    }
  });

  console.log('');

  if (hasErrors) {
    console.log('\x1b[31mValidation failed with errors.\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32mAll fixtures valid!\x1b[0m');
  }
}

main();
