#!/usr/bin/env tsx
/**
 * Fixture Validation Script
 *
 * Validates that test fixtures conform to expected schemas and contain
 * all required data for the xerodev-mcp server to function correctly.
 *
 * Usage:
 *   npm run validate:fixtures
 *   npx tsx scripts/validate-fixtures.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '..', 'test', 'fixtures');

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
});

const TaxRateSchema = z.object({
  name: z.string(),
  taxType: z.string(),
  rate: z.number(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
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

const results: ValidationResult[] = [];

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

  if (!existsSync(path)) {
    result.valid = false;
    result.errors.push('File does not exist');
    return result;
  }

  let data: any;
  try {
    data = JSON.parse(readFileSync(path, 'utf-8'));
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

function validateCrossReferences(): ValidationResult {
  const result: ValidationResult = {
    file: 'cross-references',
    valid: true,
    errors: [],
    warnings: [],
  };

  // Load data
  let accounts: any[] = [];
  let contacts: any[] = [];
  let invoices: any[] = [];

  try {
    const accountsData = JSON.parse(readFileSync(join(FIXTURES_PATH, 'accounts', 'au-chart-of-accounts.json'), 'utf-8'));
    accounts = accountsData.accounts;
  } catch {
    result.errors.push('Cannot load accounts fixture');
  }

  try {
    const contactsData = JSON.parse(readFileSync(join(FIXTURES_PATH, 'contacts', 'au-acme-contacts.json'), 'utf-8'));
    contacts = contactsData.contacts;
  } catch {
    result.errors.push('Cannot load contacts fixture');
  }

  try {
    const invoicesData = JSON.parse(readFileSync(join(FIXTURES_PATH, 'invoices', 'au-acme-valid.json'), 'utf-8'));
    invoices = invoicesData.invoices;
  } catch {
    result.errors.push('Cannot load invoices fixture');
  }

  if (result.errors.length > 0) {
    result.valid = false;
    return result;
  }

  // Validate invoice references
  const accountCodes = new Set(accounts.map(a => a.code));
  const contactIds = new Set(contacts.map(c => c.contact_id));

  invoices.forEach((invoice, index) => {
    // Check contact reference
    if (!contactIds.has(invoice.contact.contact_id)) {
      result.errors.push(`invoices[${index}]: Contact '${invoice.contact.contact_id}' not found`);
    }

    // Check line item account codes
    invoice.line_items.forEach((item: any, itemIndex: number) => {
      if (!accountCodes.has(item.account_code)) {
        result.errors.push(`invoices[${index}].line_items[${itemIndex}]: AccountCode '${item.account_code}' not found`);
      }
    });
  });

  // Check for required data
  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE');
  const revenueAccounts = activeAccounts.filter(a => a.type === 'REVENUE');
  const activeContacts = contacts.filter(c => c.status === 'ACTIVE');
  const customerContacts = activeContacts.filter(c => c.is_customer);

  if (revenueAccounts.length === 0) {
    result.warnings.push('No active REVENUE accounts found');
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

  result.valid = result.errors.length === 0;
  return result;
}

function main() {
  console.log('Validating test fixtures...\n');

  // Validate tenant
  results.push(validateFile(
    join(FIXTURES_PATH, 'tenants', 'au-acme-gst.json'),
    TenantSchema
  ));

  // Validate accounts
  results.push(validateFile(
    join(FIXTURES_PATH, 'accounts', 'au-chart-of-accounts.json'),
    z.object({ accounts: z.array(AccountSchema), tax_rates: z.array(TaxRateSchema) }),
    'accounts',
    AccountSchema
  ));

  // Validate contacts
  results.push(validateFile(
    join(FIXTURES_PATH, 'contacts', 'au-acme-contacts.json'),
    z.object({ contacts: z.array(ContactSchema) }),
    'contacts',
    ContactSchema
  ));

  // Validate invoices
  results.push(validateFile(
    join(FIXTURES_PATH, 'invoices', 'au-acme-valid.json'),
    z.object({ invoices: z.array(InvoiceSchema) }),
    'invoices',
    InvoiceSchema
  ));

  // Validate cross-references
  results.push(validateCrossReferences());

  // Print results
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
