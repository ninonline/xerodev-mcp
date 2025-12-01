#!/usr/bin/env tsx
/**
 * Fixture Generation Script
 *
 * Generates realistic test fixtures for the xerodev-mcp server.
 * Uses @faker-js/faker to create realistic Australian business data.
 *
 * Usage:
 *   npm run generate:fixtures
 *   npx tsx scripts/generate-fixtures.ts
 */

import { faker } from '@faker-js/faker';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '..', 'test', 'fixtures');

// Ensure directories exist
const dirs = ['tenants', 'accounts', 'contacts', 'invoices'];
dirs.forEach(dir => {
  const path = join(FIXTURES_PATH, dir);
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
});

// Australian company suffixes
const AU_COMPANY_SUFFIXES = ['Pty Ltd', 'Ltd', 'Group', 'Holdings', 'Services', 'Solutions'];

// Australian states
const AU_STATES = [
  { code: 'NSW', name: 'New South Wales', cities: ['Sydney', 'Newcastle', 'Wollongong'] },
  { code: 'VIC', name: 'Victoria', cities: ['Melbourne', 'Geelong', 'Ballarat'] },
  { code: 'QLD', name: 'Queensland', cities: ['Brisbane', 'Gold Coast', 'Cairns'] },
  { code: 'WA', name: 'Western Australia', cities: ['Perth', 'Fremantle', 'Bunbury'] },
  { code: 'SA', name: 'South Australia', cities: ['Adelaide', 'Mount Gambier', 'Whyalla'] },
  { code: 'TAS', name: 'Tasmania', cities: ['Hobart', 'Launceston', 'Devonport'] },
  { code: 'NT', name: 'Northern Territory', cities: ['Darwin', 'Alice Springs', 'Katherine'] },
  { code: 'ACT', name: 'Australian Capital Territory', cities: ['Canberra', 'Queanbeyan'] },
];

// Account types for Australian Chart of Accounts
const AU_CHART_OF_ACCOUNTS = [
  // Revenue accounts
  { code: '200', name: 'Sales', type: 'REVENUE', taxType: 'OUTPUT' },
  { code: '210', name: 'Consulting Revenue', type: 'REVENUE', taxType: 'OUTPUT' },
  { code: '215', name: 'Service Revenue', type: 'REVENUE', taxType: 'OUTPUT' },
  { code: '220', name: 'Interest Income', type: 'REVENUE', taxType: 'EXEMPTOUTPUT' },
  { code: '230', name: 'Other Revenue', type: 'REVENUE', taxType: 'OUTPUT' },
  { code: '240', name: 'Export Sales', type: 'REVENUE', taxType: 'EXEMPTOUTPUT' },
  // Expense accounts
  { code: '400', name: 'Advertising', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '404', name: 'Bank Fees', type: 'EXPENSE', taxType: 'EXEMPTINPUT' },
  { code: '408', name: 'Cleaning', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '412', name: 'Consulting & Accounting', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '416', name: 'Depreciation', type: 'EXPENSE', taxType: 'BASEXCLUDED' },
  { code: '420', name: 'Entertainment', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '424', name: 'Freight & Courier', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '428', name: 'General Expenses', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '432', name: 'Insurance', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '436', name: 'Legal Expenses', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '440', name: 'Light, Power, Heating', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '444', name: 'Motor Vehicle Expenses', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '448', name: 'Printing & Stationery', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '452', name: 'Rent', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '456', name: 'Repairs & Maintenance', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '460', name: 'Wages & Salaries', type: 'EXPENSE', taxType: 'BASEXCLUDED' },
  { code: '464', name: 'Superannuation', type: 'EXPENSE', taxType: 'BASEXCLUDED' },
  { code: '468', name: 'Telephone & Internet', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '472', name: 'Travel - National', type: 'EXPENSE', taxType: 'INPUT' },
  { code: '476', name: 'Travel - International', type: 'EXPENSE', taxType: 'EXEMPTINPUT' },
  // Bank accounts
  { code: '090', name: 'Business Bank Account', type: 'BANK', taxType: null },
  { code: '091', name: 'Business Savings Account', type: 'BANK', taxType: null },
  // Current assets
  { code: '120', name: 'Accounts Receivable', type: 'CURRENT', taxType: null },
  { code: '130', name: 'Prepayments', type: 'CURRENT', taxType: null },
  // Fixed assets
  { code: '150', name: 'Computer Equipment', type: 'FIXED', taxType: null },
  { code: '151', name: 'Less Accumulated Depreciation on Computer Equipment', type: 'FIXED', taxType: null },
  { code: '160', name: 'Office Equipment', type: 'FIXED', taxType: null },
  // Liabilities
  { code: '800', name: 'Accounts Payable', type: 'LIABILITY', taxType: null },
  { code: '820', name: 'GST', type: 'LIABILITY', taxType: null },
  { code: '825', name: 'PAYG Withholding Payable', type: 'LIABILITY', taxType: null },
  { code: '830', name: 'Superannuation Payable', type: 'LIABILITY', taxType: null },
  // Equity
  { code: '900', name: 'Owner A Funds Introduced', type: 'EQUITY', taxType: null },
  { code: '920', name: 'Retained Earnings', type: 'EQUITY', taxType: null },
  // Archived account for testing
  { code: '999', name: 'Old Sales Account (Archived)', type: 'REVENUE', taxType: 'OUTPUT', status: 'ARCHIVED' },
];

// Australian tax rates
const AU_TAX_RATES = [
  { name: 'GST on Income', taxType: 'OUTPUT', rate: 10.0, status: 'ACTIVE' },
  { name: 'GST on Expenses', taxType: 'INPUT', rate: 10.0, status: 'ACTIVE' },
  { name: 'GST Free Income', taxType: 'EXEMPTOUTPUT', rate: 0.0, status: 'ACTIVE' },
  { name: 'GST Free Expenses', taxType: 'EXEMPTINPUT', rate: 0.0, status: 'ACTIVE' },
  { name: 'BAS Excluded', taxType: 'BASEXCLUDED', rate: 0.0, status: 'ACTIVE' },
  { name: 'Old Tax Rate', taxType: 'OLDRATE', rate: 12.5, status: 'ARCHIVED' },
];

// Service descriptions for invoices
const SERVICE_DESCRIPTIONS = [
  'Consulting Services',
  'Software Development',
  'Project Management',
  'Technical Support',
  'Training and Workshops',
  'System Integration',
  'Data Analysis',
  'Website Development',
  'Marketing Services',
  'Graphic Design',
  'Content Writing',
  'SEO Services',
  'Cloud Infrastructure Setup',
  'Security Audit',
  'Business Analysis',
];

function generateCompanyName(): string {
  const prefix = faker.company.name().split(' ')[0];
  const suffix = faker.helpers.arrayElement(AU_COMPANY_SUFFIXES);
  return `${prefix} ${suffix}`;
}

function generateAustralianAddress(): any {
  const state = faker.helpers.arrayElement(AU_STATES);
  const city = faker.helpers.arrayElement(state.cities);
  return {
    type: 'STREET',
    line1: `${faker.number.int({ min: 1, max: 500 })} ${faker.location.street()}`,
    city,
    region: state.code,
    postal_code: faker.number.int({ min: 2000, max: 7999 }).toString(),
    country: 'Australia',
  };
}

function generateContact(index: number, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE'): any {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const companyName = generateCompanyName();
  const isCustomer = faker.datatype.boolean(0.7);
  const isSupplier = faker.datatype.boolean(0.3);

  return {
    contact_id: `contact-${String(index).padStart(3, '0')}`,
    name: companyName,
    first_name: firstName,
    last_name: lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${companyName.toLowerCase().replace(/\s+/g, '').slice(0, 15)}.com.au`,
    is_customer: isCustomer,
    is_supplier: isSupplier,
    status,
    addresses: [generateAustralianAddress()],
    phones: [{
      type: 'DEFAULT',
      number: `0${faker.number.int({ min: 2, max: 8 })} ${faker.number.int({ min: 1000, max: 9999 })} ${faker.number.int({ min: 1000, max: 9999 })}`,
    }],
  };
}

function generateInvoice(index: number, contacts: any[], accounts: any[]): any {
  const revenueAccounts = accounts.filter(a => a.type === 'REVENUE' && a.status !== 'ARCHIVED');
  const activeContacts = contacts.filter(c => c.status === 'ACTIVE' && c.is_customer);
  const contact = faker.helpers.arrayElement(activeContacts);
  const account = faker.helpers.arrayElement(revenueAccounts);

  // Generate dates
  const invoiceDate = faker.date.recent({ days: 30 });
  const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Generate line items (1-3)
  const numLineItems = faker.number.int({ min: 1, max: 3 });
  const lineItems = [];
  for (let i = 0; i < numLineItems; i++) {
    lineItems.push({
      description: faker.helpers.arrayElement(SERVICE_DESCRIPTIONS),
      quantity: faker.number.int({ min: 1, max: 20 }),
      unit_amount: faker.number.float({ min: 50, max: 500, fractionDigits: 2 }),
      account_code: account.code,
      tax_type: account.taxType || 'OUTPUT',
    });
  }

  // Calculate totals
  const subTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_amount), 0);
  const taxAmount = lineItems.reduce((sum, item) => {
    const rate = item.tax_type === 'OUTPUT' || item.tax_type === 'INPUT' ? 0.1 : 0;
    return sum + (item.quantity * item.unit_amount * rate);
  }, 0);

  return {
    invoice_id: `invoice-${String(index).padStart(3, '0')}`,
    type: 'ACCREC',
    contact: {
      contact_id: contact.contact_id,
      name: contact.name,
    },
    date: invoiceDate.toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    status: faker.helpers.arrayElement(['DRAFT', 'AUTHORISED']),
    line_amount_types: 'Exclusive',
    line_items: lineItems,
    currency_code: 'AUD',
    sub_total: Math.round(subTotal * 100) / 100,
    total_tax: Math.round(taxAmount * 100) / 100,
    total: Math.round((subTotal + taxAmount) * 100) / 100,
  };
}

// Generate tenant
function generateTenant(): any {
  return {
    _meta: {
      description: 'Australian tenant with GST tax system',
      region: 'AU',
      currency: 'AUD',
    },
    tenant_id: 'acme-au-001',
    xero_tenant_id: faker.string.uuid(),
    org_name: 'Acme Corporation Pty Ltd',
    region: 'AU',
    currency: 'AUD',
    tax_system: 'GST',
    granted_scopes: [
      'openid',
      'profile',
      'email',
      'accounting.transactions',
      'accounting.contacts',
      'accounting.settings',
    ],
    connection_status: 'active',
  };
}

// Generate accounts fixture
function generateAccountsFixture(): any {
  return {
    _meta: {
      description: 'Australian Chart of Accounts with GST tax types',
      tenant_id: 'acme-au-001',
      region: 'AU',
    },
    accounts: AU_CHART_OF_ACCOUNTS.map((a, i) => ({
      account_id: `account-${String(i + 1).padStart(3, '0')}`,
      code: a.code,
      name: a.name,
      type: a.type,
      tax_type: a.taxType,
      status: a.status || 'ACTIVE',
    })),
    tax_rates: AU_TAX_RATES,
  };
}

// Generate contacts fixture
function generateContactsFixture(count: number = 20): any {
  const contacts = [];

  // Generate active contacts
  for (let i = 1; i <= count - 2; i++) {
    contacts.push(generateContact(i, 'ACTIVE'));
  }

  // Add an archived contact for testing
  contacts.push({
    contact_id: `contact-${String(count - 1).padStart(3, '0')}`,
    name: 'Old Supplier Co',
    email: 'defunct@oldsupplier.com.au',
    first_name: 'Jane',
    last_name: 'Smith',
    is_customer: false,
    is_supplier: true,
    status: 'ARCHIVED',
    addresses: [],
    phones: [],
  });

  // Add a test contact
  contacts.push({
    contact_id: `contact-${String(count).padStart(3, '0')}`,
    name: 'Test Customer',
    email: 'test@example.com.au',
    first_name: 'Test',
    last_name: 'User',
    is_customer: true,
    is_supplier: false,
    status: 'ACTIVE',
    addresses: [generateAustralianAddress()],
    phones: [{ type: 'DEFAULT', number: '03 0000 0000' }],
  });

  return {
    _meta: {
      description: 'Sample contacts for AU tenant',
      tenant_id: 'acme-au-001',
      count: contacts.length,
    },
    contacts,
  };
}

// Generate invoices fixture
function generateInvoicesFixture(contacts: any[], accounts: any[], count: number = 20): any {
  const invoices = [];

  for (let i = 1; i <= count; i++) {
    invoices.push(generateInvoice(i, contacts, accounts));
  }

  return {
    _meta: {
      description: 'Sample invoices for AU tenant',
      tenant_id: 'acme-au-001',
      count: invoices.length,
    },
    invoices,
  };
}

// Main generation function
function main() {
  console.log('Generating test fixtures...\n');

  // Generate tenant
  const tenant = generateTenant();
  writeFileSync(
    join(FIXTURES_PATH, 'tenants', 'au-acme-gst.json'),
    JSON.stringify(tenant, null, 2)
  );
  console.log('  Created: test/fixtures/tenants/au-acme-gst.json');

  // Generate accounts
  const accountsFixture = generateAccountsFixture();
  writeFileSync(
    join(FIXTURES_PATH, 'accounts', 'au-chart-of-accounts.json'),
    JSON.stringify(accountsFixture, null, 2)
  );
  console.log(`  Created: test/fixtures/accounts/au-chart-of-accounts.json (${accountsFixture.accounts.length} accounts)`);

  // Generate contacts
  const contactsFixture = generateContactsFixture(20);
  writeFileSync(
    join(FIXTURES_PATH, 'contacts', 'au-acme-contacts.json'),
    JSON.stringify(contactsFixture, null, 2)
  );
  console.log(`  Created: test/fixtures/contacts/au-acme-contacts.json (${contactsFixture.contacts.length} contacts)`);

  // Generate invoices
  const invoicesFixture = generateInvoicesFixture(
    contactsFixture.contacts,
    accountsFixture.accounts,
    20
  );
  writeFileSync(
    join(FIXTURES_PATH, 'invoices', 'au-acme-valid.json'),
    JSON.stringify(invoicesFixture, null, 2)
  );
  console.log(`  Created: test/fixtures/invoices/au-acme-valid.json (${invoicesFixture.invoices.length} invoices)`);

  console.log('\nFixture generation complete!');
}

main();
