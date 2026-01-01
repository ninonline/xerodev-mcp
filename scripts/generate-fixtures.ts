#!/usr/bin/env tsx
/**
 * Fixture Generation Script
 *
 * Generates realistic test fixtures for the xerodev-mcp server.
 * Supports AU (GST), UK (VAT), and US (Sales Tax) regions.
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

// Ensure all fixture directories exist
const FIXTURE_DIRS = [
  'tenants',
  'accounts',
  'contacts',
  'invoices',
  'quotes',
  'credit-notes',
  'payments',
  'bank-transactions',
];

FIXTURE_DIRS.forEach(dir => {
  const path = join(FIXTURES_PATH, dir);
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
});

// =============================================================================
// Type Definitions
// =============================================================================

type Region = 'AU' | 'UK' | 'US';

interface AccountDef {
  code: string;
  name: string;
  type: 'REVENUE' | 'EXPENSE' | 'BANK' | 'CURRENT' | 'FIXED' | 'LIABILITY' | 'EQUITY';
  taxType: string | null;
  status?: 'ACTIVE' | 'ARCHIVED';
  description?: string;
}

interface TaxRateDef {
  name: string;
  taxType: string;
  rate: number;
  status: 'ACTIVE' | 'ARCHIVED';
  description?: string;
}

interface RegionDef {
  code: string;
  name: string;
  cities: string[];
}

interface RegionConfig {
  companySuffixes: string[];
  regions: RegionDef[];
  chartOfAccounts: AccountDef[];
  taxRates: TaxRateDef[];
  currency: string;
  taxSystem: string;
  country: string;
  generatePhone: () => string;
  generatePostalCode: () => string;
}

interface TenantConfig {
  region: Region;
  tenantId: string;
  orgName: string;
  filePrefix: string;
}

// =============================================================================
// Australian (GST) Configuration
// =============================================================================

const AU_COMPANY_SUFFIXES = ['Pty Ltd', 'Ltd', 'Group', 'Holdings', 'Services', 'Solutions'];

const AU_REGIONS: RegionDef[] = [
  { code: 'NSW', name: 'New South Wales', cities: ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast'] },
  { code: 'VIC', name: 'Victoria', cities: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo'] },
  { code: 'QLD', name: 'Queensland', cities: ['Brisbane', 'Gold Coast', 'Cairns', 'Townsville'] },
  { code: 'WA', name: 'Western Australia', cities: ['Perth', 'Fremantle', 'Bunbury', 'Mandurah'] },
  { code: 'SA', name: 'South Australia', cities: ['Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge'] },
  { code: 'TAS', name: 'Tasmania', cities: ['Hobart', 'Launceston', 'Devonport', 'Burnie'] },
  { code: 'NT', name: 'Northern Territory', cities: ['Darwin', 'Alice Springs', 'Katherine', 'Palmerston'] },
  { code: 'ACT', name: 'Australian Capital Territory', cities: ['Canberra', 'Queanbeyan', 'Belconnen'] },
];

const AU_CHART_OF_ACCOUNTS: AccountDef[] = [
  // Revenue accounts
  { code: '200', name: 'Sales', type: 'REVENUE', taxType: 'OUTPUT', description: 'Income from sales of goods and services' },
  { code: '210', name: 'Interest Income', type: 'REVENUE', taxType: 'EXEMPTOUTPUT', description: 'Interest earned on bank accounts' },
  { code: '220', name: 'Other Revenue', type: 'REVENUE', taxType: 'OUTPUT', description: 'Miscellaneous revenue' },
  { code: '260', name: 'Export Sales', type: 'REVENUE', taxType: 'EXEMPTOUTPUT', description: 'Sales to overseas customers (GST-free)' },
  // Expense accounts
  { code: '300', name: 'Advertising', type: 'EXPENSE', taxType: 'INPUT', description: 'Advertising and marketing costs' },
  { code: '310', name: 'Bank Fees', type: 'EXPENSE', taxType: 'EXEMPTINPUT', description: 'Bank charges and fees (GST-free)' },
  { code: '320', name: 'Consulting & Accounting', type: 'EXPENSE', taxType: 'INPUT', description: 'Professional services' },
  { code: '330', name: 'Depreciation', type: 'EXPENSE', taxType: 'BASEXCLUDED', description: 'Depreciation of fixed assets' },
  { code: '400', name: 'Office Expenses', type: 'EXPENSE', taxType: 'INPUT', description: 'General office supplies and expenses' },
  { code: '410', name: 'Printing & Stationery', type: 'EXPENSE', taxType: 'INPUT', description: 'Printing and stationery supplies' },
  { code: '420', name: 'Rent', type: 'EXPENSE', taxType: 'INPUT', description: 'Office rent payments' },
  { code: '429', name: 'General Expenses', type: 'EXPENSE', taxType: 'INPUT', description: 'Miscellaneous expenses' },
  { code: '430', name: 'Subscriptions', type: 'EXPENSE', taxType: 'INPUT', description: 'Software and publication subscriptions' },
  { code: '440', name: 'Telephone & Internet', type: 'EXPENSE', taxType: 'INPUT', description: 'Communication expenses' },
  { code: '450', name: 'Travel - National', type: 'EXPENSE', taxType: 'INPUT', description: 'Domestic travel expenses' },
  { code: '460', name: 'Travel - International', type: 'EXPENSE', taxType: 'EXEMPTINPUT', description: 'International travel (GST-free)' },
  { code: '469', name: 'Prepaid Expenses', type: 'EXPENSE', taxType: 'INPUT', description: 'Expenses paid in advance' },
  { code: '470', name: 'Wages & Salaries', type: 'EXPENSE', taxType: 'BASEXCLUDED', description: 'Employee wages and salaries' },
  { code: '478', name: 'Training', type: 'EXPENSE', taxType: 'INPUT', description: 'Staff training expenses' },
  { code: '480', name: 'Superannuation', type: 'EXPENSE', taxType: 'BASEXCLUDED', description: 'Superannuation contributions' },
  // Current assets
  { code: '610', name: 'Accounts Receivable', type: 'CURRENT', taxType: null, description: 'Trade debtors' },
  { code: '620', name: 'Prepayments', type: 'CURRENT', taxType: null, description: 'Prepaid expenses' },
  // Fixed assets
  { code: '710', name: 'Office Equipment', type: 'FIXED', taxType: null, description: 'Office furniture and equipment' },
  { code: '720', name: 'Computer Equipment', type: 'FIXED', taxType: null, description: 'Computers and peripherals' },
  // Liabilities
  { code: '800', name: 'Accounts Payable', type: 'LIABILITY', taxType: null, description: 'Trade creditors' },
  { code: '810', name: 'GST Collected', type: 'LIABILITY', taxType: null, description: 'GST collected on sales' },
  { code: '820', name: 'GST Paid', type: 'CURRENT', taxType: null, description: 'GST paid on purchases' },
  { code: '830', name: 'PAYG Withholding', type: 'LIABILITY', taxType: null, description: 'PAYG tax withheld from employees' },
  { code: '840', name: 'Superannuation Payable', type: 'LIABILITY', taxType: null, description: 'Superannuation liability' },
  // Bank accounts
  { code: '090', name: 'Business Bank Account', type: 'BANK', taxType: null, description: 'Main business bank account' },
  { code: '091', name: 'Savings Account', type: 'BANK', taxType: null, description: 'Business savings account' },
  // Equity
  { code: '900', name: "Owner's Equity", type: 'EQUITY', taxType: null, description: "Owner's capital" },
  { code: '910', name: 'Retained Earnings', type: 'EQUITY', taxType: null, description: 'Accumulated profits' },
  // Archived for testing
  { code: '999', name: 'Old Sales Account', type: 'REVENUE', taxType: 'OUTPUT', description: 'Archived account - DO NOT USE', status: 'ARCHIVED' },
];

const AU_TAX_RATES: TaxRateDef[] = [
  { name: 'GST on Income', taxType: 'OUTPUT', rate: 10.0, status: 'ACTIVE', description: '10% GST on sales' },
  { name: 'GST on Expenses', taxType: 'INPUT', rate: 10.0, status: 'ACTIVE', description: '10% GST on purchases' },
  { name: 'GST Free Income', taxType: 'EXEMPTOUTPUT', rate: 0.0, status: 'ACTIVE', description: 'GST-free sales (exports, medical, etc.)' },
  { name: 'GST Free Expenses', taxType: 'EXEMPTINPUT', rate: 0.0, status: 'ACTIVE', description: 'GST-free purchases' },
  { name: 'BAS Excluded', taxType: 'BASEXCLUDED', rate: 0.0, status: 'ACTIVE', description: 'Not reported on BAS (wages, depreciation)' },
];

// =============================================================================
// UK (VAT) Configuration
// =============================================================================

const UK_COMPANY_SUFFIXES = ['Ltd', 'Limited', 'PLC', 'LLP', 'Group', 'Holdings', 'Services'];

const UK_REGIONS: RegionDef[] = [
  { code: 'LND', name: 'London', cities: ['London', 'Westminster', 'Greenwich', 'Camden'] },
  { code: 'MAN', name: 'Greater Manchester', cities: ['Manchester', 'Salford', 'Bolton', 'Stockport'] },
  { code: 'WMD', name: 'West Midlands', cities: ['Birmingham', 'Coventry', 'Wolverhampton', 'Dudley'] },
  { code: 'WYK', name: 'West Yorkshire', cities: ['Leeds', 'Bradford', 'Wakefield', 'Huddersfield'] },
  { code: 'MER', name: 'Merseyside', cities: ['Liverpool', 'Wirral', 'St Helens', 'Knowsley'] },
  { code: 'SYK', name: 'South Yorkshire', cities: ['Sheffield', 'Doncaster', 'Rotherham', 'Barnsley'] },
  { code: 'TYN', name: 'Tyne and Wear', cities: ['Newcastle', 'Sunderland', 'Gateshead', 'South Shields'] },
  { code: 'SCT', name: 'Scotland', cities: ['Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee'] },
  { code: 'WAL', name: 'Wales', cities: ['Cardiff', 'Swansea', 'Newport', 'Wrexham'] },
  { code: 'NIR', name: 'Northern Ireland', cities: ['Belfast', 'Derry', 'Lisburn', 'Newry'] },
];

const UK_CHART_OF_ACCOUNTS: AccountDef[] = [
  // Revenue accounts (UK uses OUTPUT2 for 20% VAT)
  { code: '4000', name: 'Sales', type: 'REVENUE', taxType: 'OUTPUT2', description: 'Income from sales of goods and services' },
  { code: '4010', name: 'Service Revenue', type: 'REVENUE', taxType: 'OUTPUT2', description: 'Revenue from services rendered' },
  { code: '4020', name: 'Interest Income', type: 'REVENUE', taxType: 'EXEMPTOUTPUT', description: 'Bank interest (exempt from VAT)' },
  { code: '4030', name: 'Zero-Rated Sales', type: 'REVENUE', taxType: 'ZERORATEDOUTPUT', description: 'Food, books, children\'s clothing' },
  { code: '4040', name: 'Export Sales', type: 'REVENUE', taxType: 'ZERORATEDOUTPUT', description: 'Sales to overseas customers' },
  { code: '4050', name: 'Reduced Rate Sales', type: 'REVENUE', taxType: 'RROUTPUT', description: 'Energy, mobility aids (5%)' },
  // Expense accounts
  { code: '5000', name: 'Cost of Sales', type: 'EXPENSE', taxType: 'INPUT2', description: 'Direct costs of goods sold' },
  { code: '6000', name: 'Advertising & Marketing', type: 'EXPENSE', taxType: 'INPUT2', description: 'Advertising and promotional costs' },
  { code: '6010', name: 'Bank Charges', type: 'EXPENSE', taxType: 'EXEMPTINPUT', description: 'Bank fees (VAT exempt)' },
  { code: '6020', name: 'Professional Fees', type: 'EXPENSE', taxType: 'INPUT2', description: 'Accountants, lawyers, consultants' },
  { code: '6030', name: 'Depreciation', type: 'EXPENSE', taxType: 'NONE', description: 'Depreciation of fixed assets' },
  { code: '6040', name: 'Office Expenses', type: 'EXPENSE', taxType: 'INPUT2', description: 'General office supplies' },
  { code: '6050', name: 'Rent', type: 'EXPENSE', taxType: 'EXEMPTINPUT', description: 'Office rent (often exempt)' },
  { code: '6060', name: 'Software & Subscriptions', type: 'EXPENSE', taxType: 'INPUT2', description: 'Software licences and subscriptions' },
  { code: '6070', name: 'Telephone & Internet', type: 'EXPENSE', taxType: 'INPUT2', description: 'Communication costs' },
  { code: '6080', name: 'Travel & Subsistence', type: 'EXPENSE', taxType: 'INPUT2', description: 'Business travel expenses' },
  { code: '6090', name: 'Training', type: 'EXPENSE', taxType: 'ZERORATEDINPUT', description: 'Education and training (zero-rated)' },
  { code: '7000', name: 'Wages & Salaries', type: 'EXPENSE', taxType: 'NONE', description: 'Employee wages' },
  { code: '7010', name: 'Employer NI Contributions', type: 'EXPENSE', taxType: 'NONE', description: 'Employer National Insurance' },
  { code: '7020', name: 'Pension Contributions', type: 'EXPENSE', taxType: 'NONE', description: 'Employer pension contributions' },
  { code: '7030', name: 'Energy Costs', type: 'EXPENSE', taxType: 'RRINPUT', description: 'Electricity and gas (5% reduced rate)' },
  // Current assets
  { code: '1100', name: 'Trade Debtors', type: 'CURRENT', taxType: null, description: 'Accounts receivable' },
  { code: '1200', name: 'Prepayments', type: 'CURRENT', taxType: null, description: 'Prepaid expenses' },
  // Fixed assets
  { code: '0010', name: 'Office Equipment', type: 'FIXED', taxType: null, description: 'Office furniture and equipment' },
  { code: '0020', name: 'Computer Equipment', type: 'FIXED', taxType: null, description: 'IT hardware' },
  // Liabilities
  { code: '2100', name: 'Trade Creditors', type: 'LIABILITY', taxType: null, description: 'Accounts payable' },
  { code: '2200', name: 'VAT Liability', type: 'LIABILITY', taxType: null, description: 'VAT owed to HMRC' },
  { code: '2210', name: 'PAYE Liability', type: 'LIABILITY', taxType: null, description: 'PAYE and NI owed to HMRC' },
  { code: '2220', name: 'Pension Liability', type: 'LIABILITY', taxType: null, description: 'Pension contributions owed' },
  // Bank accounts
  { code: '1000', name: 'Current Account', type: 'BANK', taxType: null, description: 'Main business current account' },
  { code: '1010', name: 'Savings Account', type: 'BANK', taxType: null, description: 'Business savings account' },
  // Equity
  { code: '3000', name: 'Share Capital', type: 'EQUITY', taxType: null, description: 'Issued share capital' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY', taxType: null, description: 'Accumulated profits' },
  // Archived for testing
  { code: '9999', name: 'Old Sales Account', type: 'REVENUE', taxType: 'OUTPUT2', description: 'Archived account - DO NOT USE', status: 'ARCHIVED' },
];

const UK_TAX_RATES: TaxRateDef[] = [
  { name: '20% (VAT on Income)', taxType: 'OUTPUT2', rate: 20.0, status: 'ACTIVE', description: 'Standard rate VAT on sales' },
  { name: '20% (VAT on Expenses)', taxType: 'INPUT2', rate: 20.0, status: 'ACTIVE', description: 'Standard rate VAT on purchases' },
  { name: 'Zero Rated Income', taxType: 'ZERORATEDOUTPUT', rate: 0.0, status: 'ACTIVE', description: 'Food, books, children\'s clothing' },
  { name: 'Zero Rated Expenses', taxType: 'ZERORATEDINPUT', rate: 0.0, status: 'ACTIVE', description: 'Zero-rated purchases' },
  { name: 'Exempt Income', taxType: 'EXEMPTOUTPUT', rate: 0.0, status: 'ACTIVE', description: 'Financial services, insurance' },
  { name: 'Exempt Expenses', taxType: 'EXEMPTINPUT', rate: 0.0, status: 'ACTIVE', description: 'VAT exempt purchases' },
  { name: '5% (Reduced Rate Income)', taxType: 'RROUTPUT', rate: 5.0, status: 'ACTIVE', description: 'Energy, mobility aids' },
  { name: '5% (Reduced Rate Expenses)', taxType: 'RRINPUT', rate: 5.0, status: 'ACTIVE', description: 'Reduced rate purchases' },
  { name: 'No VAT', taxType: 'NONE', rate: 0.0, status: 'ACTIVE', description: 'Outside scope of VAT' },
];

// =============================================================================
// US (Sales Tax) Configuration
// =============================================================================

const US_COMPANY_SUFFIXES = ['Inc', 'LLC', 'Corp', 'Corporation', 'Co', 'Company', 'LP'];

const US_REGIONS: RegionDef[] = [
  { code: 'CA', name: 'California', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose'] },
  { code: 'NY', name: 'New York', cities: ['New York City', 'Buffalo', 'Rochester', 'Albany'] },
  { code: 'TX', name: 'Texas', cities: ['Houston', 'Dallas', 'Austin', 'San Antonio'] },
  { code: 'FL', name: 'Florida', cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville'] },
  { code: 'WA', name: 'Washington', cities: ['Seattle', 'Tacoma', 'Spokane', 'Bellevue'] },
  { code: 'MA', name: 'Massachusetts', cities: ['Boston', 'Cambridge', 'Worcester', 'Springfield'] },
  { code: 'CO', name: 'Colorado', cities: ['Denver', 'Colorado Springs', 'Boulder', 'Fort Collins'] },
  { code: 'IL', name: 'Illinois', cities: ['Chicago', 'Aurora', 'Naperville', 'Rockford'] },
  { code: 'GA', name: 'Georgia', cities: ['Atlanta', 'Augusta', 'Savannah', 'Columbus'] },
  { code: 'NC', name: 'North Carolina', cities: ['Charlotte', 'Raleigh', 'Durham', 'Greensboro'] },
];

const US_CHART_OF_ACCOUNTS: AccountDef[] = [
  // Revenue accounts (US typically doesn't set tax type on accounts)
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE', taxType: null, description: 'Income from sales' },
  { code: '4010', name: 'Service Revenue', type: 'REVENUE', taxType: null, description: 'Revenue from services' },
  { code: '4020', name: 'Interest Income', type: 'REVENUE', taxType: null, description: 'Bank interest earned' },
  { code: '4030', name: 'Other Income', type: 'REVENUE', taxType: null, description: 'Miscellaneous income' },
  // Expense accounts
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', taxType: null, description: 'Direct costs' },
  { code: '6000', name: 'Advertising & Marketing', type: 'EXPENSE', taxType: null, description: 'Marketing expenses' },
  { code: '6010', name: 'Bank Service Charges', type: 'EXPENSE', taxType: null, description: 'Bank fees' },
  { code: '6020', name: 'Professional Services', type: 'EXPENSE', taxType: null, description: 'Legal, accounting, consulting' },
  { code: '6030', name: 'Depreciation Expense', type: 'EXPENSE', taxType: null, description: 'Asset depreciation' },
  { code: '6040', name: 'Office Supplies', type: 'EXPENSE', taxType: null, description: 'Office supplies and expenses' },
  { code: '6050', name: 'Rent Expense', type: 'EXPENSE', taxType: null, description: 'Office and facility rent' },
  { code: '6060', name: 'Software & Subscriptions', type: 'EXPENSE', taxType: null, description: 'Software licences' },
  { code: '6070', name: 'Telephone & Internet', type: 'EXPENSE', taxType: null, description: 'Communication costs' },
  { code: '6080', name: 'Travel Expense', type: 'EXPENSE', taxType: null, description: 'Business travel' },
  { code: '6090', name: 'Utilities', type: 'EXPENSE', taxType: null, description: 'Electricity, water, gas' },
  { code: '7000', name: 'Wages & Salaries', type: 'EXPENSE', taxType: null, description: 'Employee compensation' },
  { code: '7010', name: 'Payroll Taxes', type: 'EXPENSE', taxType: null, description: 'Employer payroll taxes' },
  { code: '7020', name: '401(k) Contributions', type: 'EXPENSE', taxType: null, description: 'Retirement plan contributions' },
  { code: '7030', name: 'Health Insurance', type: 'EXPENSE', taxType: null, description: 'Employee health benefits' },
  // Current assets
  { code: '1100', name: 'Accounts Receivable', type: 'CURRENT', taxType: null, description: 'Trade receivables' },
  { code: '1200', name: 'Prepaid Expenses', type: 'CURRENT', taxType: null, description: 'Prepaid items' },
  // Fixed assets
  { code: '1500', name: 'Furniture & Fixtures', type: 'FIXED', taxType: null, description: 'Office furniture' },
  { code: '1510', name: 'Computer Equipment', type: 'FIXED', taxType: null, description: 'IT hardware' },
  // Liabilities
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', taxType: null, description: 'Trade payables' },
  { code: '2100', name: 'Sales Tax Payable', type: 'LIABILITY', taxType: null, description: 'Sales tax collected' },
  { code: '2200', name: 'Payroll Liabilities', type: 'LIABILITY', taxType: null, description: 'Payroll taxes owed' },
  { code: '2300', name: '401(k) Payable', type: 'LIABILITY', taxType: null, description: 'Retirement contributions owed' },
  // Bank accounts
  { code: '1000', name: 'Checking Account', type: 'BANK', taxType: null, description: 'Main checking account' },
  { code: '1010', name: 'Savings Account', type: 'BANK', taxType: null, description: 'Business savings' },
  // Equity
  { code: '3000', name: 'Common Stock', type: 'EQUITY', taxType: null, description: 'Issued stock' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY', taxType: null, description: 'Accumulated earnings' },
  // Archived for testing
  { code: '9999', name: 'Old Sales Account', type: 'REVENUE', taxType: null, description: 'Archived account - DO NOT USE', status: 'ARCHIVED' },
];

const US_TAX_RATES: TaxRateDef[] = [
  { name: 'Tax on Sales', taxType: 'TAX', rate: 0.0, status: 'ACTIVE', description: 'Sales tax (rate varies by jurisdiction)' },
  { name: 'Tax Exempt', taxType: 'EXEMPTOUTPUT', rate: 0.0, status: 'ACTIVE', description: 'Exempt from sales tax' },
  { name: 'No Tax', taxType: 'NONE', rate: 0.0, status: 'ACTIVE', description: 'No sales tax applicable' },
];

// =============================================================================
// Region Configurations
// =============================================================================

const REGION_CONFIGS: Record<Region, RegionConfig> = {
  AU: {
    companySuffixes: AU_COMPANY_SUFFIXES,
    regions: AU_REGIONS,
    chartOfAccounts: AU_CHART_OF_ACCOUNTS,
    taxRates: AU_TAX_RATES,
    currency: 'AUD',
    taxSystem: 'GST',
    country: 'Australia',
    generatePhone: () => `0${faker.number.int({ min: 2, max: 8 })} ${faker.number.int({ min: 1000, max: 9999 })} ${faker.number.int({ min: 1000, max: 9999 })}`,
    generatePostalCode: () => faker.number.int({ min: 2000, max: 7999 }).toString(),
  },
  UK: {
    companySuffixes: UK_COMPANY_SUFFIXES,
    regions: UK_REGIONS,
    chartOfAccounts: UK_CHART_OF_ACCOUNTS,
    taxRates: UK_TAX_RATES,
    currency: 'GBP',
    taxSystem: 'VAT',
    country: 'United Kingdom',
    generatePhone: () => `+44 ${faker.number.int({ min: 1000, max: 9999 })} ${faker.number.int({ min: 100000, max: 999999 })}`,
    generatePostalCode: () => {
      const area = faker.string.alpha({ length: 2, casing: 'upper' });
      const district = faker.number.int({ min: 1, max: 99 });
      const sector = faker.number.int({ min: 1, max: 9 });
      const unit = faker.string.alpha({ length: 2, casing: 'upper' });
      return `${area}${district} ${sector}${unit}`;
    },
  },
  US: {
    companySuffixes: US_COMPANY_SUFFIXES,
    regions: US_REGIONS,
    chartOfAccounts: US_CHART_OF_ACCOUNTS,
    taxRates: US_TAX_RATES,
    currency: 'USD',
    taxSystem: 'SALES_TAX',
    country: 'United States',
    generatePhone: () => `(${faker.number.int({ min: 200, max: 999 })}) ${faker.number.int({ min: 200, max: 999 })}-${faker.number.int({ min: 1000, max: 9999 })}`,
    generatePostalCode: () => faker.number.int({ min: 10000, max: 99999 }).toString(),
  },
};

// Tenant configurations
const TENANT_CONFIGS: TenantConfig[] = [
  { region: 'AU', tenantId: 'acme-au-001', orgName: 'Acme Corporation Pty Ltd', filePrefix: 'au-acme' },
  { region: 'UK', tenantId: 'company-uk-001', orgName: 'Acme Technologies Ltd', filePrefix: 'uk-ltd' },
  { region: 'US', tenantId: 'startup-us-001', orgName: 'TechStart Inc', filePrefix: 'us-startup' },
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

// =============================================================================
// Generator Functions
// =============================================================================

function generateCompanyName(config: RegionConfig): string {
  const prefix = faker.company.name().split(' ')[0];
  const suffix = faker.helpers.arrayElement(config.companySuffixes);
  return `${prefix} ${suffix}`;
}

function generateAddress(config: RegionConfig): any {
  const regionDef = faker.helpers.arrayElement(config.regions);
  const city = faker.helpers.arrayElement(regionDef.cities);
  return {
    type: 'STREET',
    line1: `${faker.number.int({ min: 1, max: 500 })} ${faker.location.street()}`,
    city,
    region: regionDef.code,
    postal_code: config.generatePostalCode(),
    country: config.country,
  };
}

function generateContact(index: number, config: RegionConfig, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE'): any {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const companyName = generateCompanyName(config);
  const isCustomer = faker.datatype.boolean(0.7);
  const isSupplier = faker.datatype.boolean(0.3);

  // Generate region-appropriate email domain
  const domainSuffix = config.country === 'Australia' ? '.com.au' : config.country === 'United Kingdom' ? '.co.uk' : '.com';
  const domain = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15)}${domainSuffix}`;

  return {
    contact_id: `contact-${String(index).padStart(3, '0')}`,
    name: companyName,
    first_name: firstName,
    last_name: lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
    is_customer: isCustomer,
    is_supplier: isSupplier,
    status,
    addresses: [generateAddress(config)],
    phones: [{
      type: 'DEFAULT',
      number: config.generatePhone(),
    }],
  };
}

function getTaxRate(taxType: string | null, taxRates: TaxRateDef[]): number {
  if (!taxType) return 0;
  const rate = taxRates.find(t => t.taxType === taxType && t.status === 'ACTIVE');
  return rate?.rate ?? 0;
}

function getDefaultSalesTaxType(region: Region): string {
  switch (region) {
    case 'AU': return 'OUTPUT';
    case 'UK': return 'OUTPUT2';
    case 'US': return 'NONE';
  }
}

function generateInvoice(index: number, contacts: any[], accounts: AccountDef[], config: RegionConfig, region: Region): any {
  const revenueAccounts = accounts.filter(a => a.type === 'REVENUE' && a.status !== 'ARCHIVED');
  const activeContacts = contacts.filter(c => c.status === 'ACTIVE' && c.is_customer);
  const contact = faker.helpers.arrayElement(activeContacts);
  const account = faker.helpers.arrayElement(revenueAccounts);

  const invoiceDate = faker.date.recent({ days: 30 });
  const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const numLineItems = faker.number.int({ min: 1, max: 3 });
  const lineItems = [];
  const taxType = account.taxType || getDefaultSalesTaxType(region);

  for (let i = 0; i < numLineItems; i++) {
    lineItems.push({
      description: faker.helpers.arrayElement(SERVICE_DESCRIPTIONS),
      quantity: faker.number.int({ min: 1, max: 20 }),
      unit_amount: faker.number.float({ min: 50, max: 500, fractionDigits: 2 }),
      account_code: account.code,
      tax_type: taxType,
    });
  }

  const subTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_amount), 0);
  const taxRate = getTaxRate(taxType, config.taxRates);
  const taxAmount = subTotal * (taxRate / 100);

  return {
    invoice_id: `inv-${String(index).padStart(3, '0')}`,
    type: 'ACCREC',
    contact: { contact_id: contact.contact_id },
    date: invoiceDate.toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    // First invoice (inv-001) always AUTHORISED for payment tests
    status: index === 1 ? 'AUTHORISED' : faker.helpers.arrayElement(['DRAFT', 'AUTHORISED', 'AUTHORISED', 'AUTHORISED']),
    line_amount_types: 'Exclusive',
    line_items: lineItems,
    currency_code: config.currency,
    sub_total: Math.round(subTotal * 100) / 100,
    total_tax: Math.round(taxAmount * 100) / 100,
    total: Math.round((subTotal + taxAmount) * 100) / 100,
  };
}

function generateQuote(index: number, contacts: any[], accounts: AccountDef[], config: RegionConfig, region: Region): any {
  const revenueAccounts = accounts.filter(a => a.type === 'REVENUE' && a.status !== 'ARCHIVED');
  const activeContacts = contacts.filter(c => c.status === 'ACTIVE' && c.is_customer);
  const contact = faker.helpers.arrayElement(activeContacts);
  const account = faker.helpers.arrayElement(revenueAccounts);

  const quoteDate = faker.date.recent({ days: 14 });
  const expiryDate = new Date(quoteDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const taxType = account.taxType || getDefaultSalesTaxType(region);

  const lineItems = [{
    description: faker.helpers.arrayElement(SERVICE_DESCRIPTIONS),
    quantity: faker.number.int({ min: 1, max: 10 }),
    unit_amount: faker.number.float({ min: 100, max: 1000, fractionDigits: 2 }),
    account_code: account.code,
    tax_type: taxType,
  }];

  const subTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_amount), 0);
  const taxRate = getTaxRate(taxType, config.taxRates);
  const taxAmount = subTotal * (taxRate / 100);

  return {
    quote_id: `quote-${String(index).padStart(3, '0')}`,
    quote_number: `QU-${String(index).padStart(4, '0')}`,
    contact: { contact_id: contact.contact_id },
    date: quoteDate.toISOString().split('T')[0],
    expiry_date: expiryDate.toISOString().split('T')[0],
    status: faker.helpers.arrayElement(['DRAFT', 'SENT', 'SENT', 'ACCEPTED', 'DECLINED']),
    line_amount_types: 'Exclusive',
    line_items: lineItems,
    currency_code: config.currency,
    sub_total: Math.round(subTotal * 100) / 100,
    total_tax: Math.round(taxAmount * 100) / 100,
    total: Math.round((subTotal + taxAmount) * 100) / 100,
    title: faker.helpers.arrayElement(['Project Proposal', 'Service Quote', 'Consulting Engagement', 'Development Estimate']),
    summary: faker.lorem.sentence(),
  };
}

function generateCreditNote(index: number, contacts: any[], accounts: AccountDef[], config: RegionConfig, region: Region): any {
  const revenueAccounts = accounts.filter(a => a.type === 'REVENUE' && a.status !== 'ARCHIVED');
  const activeContacts = contacts.filter(c => c.status === 'ACTIVE');
  const contact = faker.helpers.arrayElement(activeContacts);
  const account = faker.helpers.arrayElement(revenueAccounts);

  const creditNoteDate = faker.date.recent({ days: 30 });
  const taxType = account.taxType || getDefaultSalesTaxType(region);
  const type = faker.helpers.arrayElement(['ACCRECCREDIT', 'ACCRECCREDIT', 'ACCPAYCREDIT']);

  const lineItems = [{
    description: faker.helpers.arrayElement(['Refund for services', 'Credit adjustment', 'Returned goods credit', 'Discount applied']),
    quantity: 1,
    unit_amount: faker.number.float({ min: 50, max: 300, fractionDigits: 2 }),
    account_code: account.code,
    tax_type: taxType,
  }];

  const subTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_amount), 0);
  const taxRate = getTaxRate(taxType, config.taxRates);
  const taxAmount = subTotal * (taxRate / 100);

  return {
    credit_note_id: `cn-${String(index).padStart(3, '0')}`,
    credit_note_number: `CN-${String(index).padStart(4, '0')}`,
    type,
    contact: { contact_id: contact.contact_id },
    date: creditNoteDate.toISOString().split('T')[0],
    // First credit note (cn-001) always AUTHORISED for refund tests
    status: index === 1 ? 'AUTHORISED' : faker.helpers.arrayElement(['DRAFT', 'AUTHORISED', 'AUTHORISED', 'AUTHORISED']),
    line_amount_types: 'Exclusive',
    line_items: lineItems,
    currency_code: config.currency,
    sub_total: Math.round(subTotal * 100) / 100,
    total_tax: Math.round(taxAmount * 100) / 100,
    total: Math.round((subTotal + taxAmount) * 100) / 100,
    remaining_credit: Math.round((subTotal + taxAmount) * 100) / 100,
    reference: `Ref: ${faker.string.alphanumeric(8).toUpperCase()}`,
  };
}

function generatePayment(index: number, invoices: any[], accounts: AccountDef[], config: RegionConfig): any {
  const authorisedInvoices = invoices.filter(i => i.status === 'AUTHORISED');
  const bankAccounts = accounts.filter(a => a.type === 'BANK');

  if (authorisedInvoices.length === 0 || bankAccounts.length === 0) {
    return null;
  }

  const invoice = faker.helpers.arrayElement(authorisedInvoices);
  const bankAccount = faker.helpers.arrayElement(bankAccounts);
  const paymentDate = faker.date.recent({ days: 14 });

  return {
    payment_id: `pay-${String(index).padStart(3, '0')}`,
    invoice: { invoice_id: invoice.invoice_id },
    account: { account_id: `acc-bank-${bankAccount.code}` },
    date: paymentDate.toISOString().split('T')[0],
    amount: invoice.total,
    currency_code: config.currency,
    reference: faker.helpers.arrayElement(['EFT Payment', 'Direct Deposit', 'Wire Transfer', 'Card Payment']),
    status: 'AUTHORISED',
  };
}

function generateBankTransaction(index: number, contacts: any[], accounts: AccountDef[], config: RegionConfig, region: Region): any {
  const bankAccounts = accounts.filter(a => a.type === 'BANK');
  const revenueAccounts = accounts.filter(a => a.type === 'REVENUE' && a.status !== 'ARCHIVED');
  const expenseAccounts = accounts.filter(a => a.type === 'EXPENSE' && a.status !== 'ARCHIVED');
  const activeContacts = contacts.filter(c => c.status === 'ACTIVE');

  if (bankAccounts.length === 0) return null;

  const bankAccount = faker.helpers.arrayElement(bankAccounts);
  const transactionDate = faker.date.recent({ days: 30 });
  const isReceive = faker.datatype.boolean(0.6);
  const type = isReceive ? 'RECEIVE' : 'SPEND';
  const lineAccount = isReceive
    ? faker.helpers.arrayElement(revenueAccounts)
    : faker.helpers.arrayElement(expenseAccounts);
  const contact = faker.helpers.arrayElement(activeContacts);

  const taxType = lineAccount?.taxType || getDefaultSalesTaxType(region);
  const amount = faker.number.float({ min: 50, max: 500, fractionDigits: 2 });
  const taxRate = getTaxRate(taxType, config.taxRates);
  const taxAmount = amount * (taxRate / 100);

  return {
    bank_transaction_id: `bt-${String(index).padStart(3, '0')}`,
    type,
    contact: { contact_id: contact.contact_id },
    bank_account: { account_id: `acc-bank-${bankAccount.code}` },
    date: transactionDate.toISOString().split('T')[0],
    status: faker.helpers.arrayElement(['AUTHORISED', 'AUTHORISED', 'DRAFT']),
    line_amount_types: 'Exclusive',
    line_items: [{
      description: isReceive ? 'Customer payment received' : faker.helpers.arrayElement(['Office supplies', 'Software subscription', 'Utilities payment']),
      quantity: 1,
      unit_amount: amount,
      account_code: lineAccount?.code || revenueAccounts[0]?.code,
      tax_type: taxType,
    }],
    currency_code: config.currency,
    sub_total: Math.round(amount * 100) / 100,
    total_tax: Math.round(taxAmount * 100) / 100,
    total: Math.round((amount + taxAmount) * 100) / 100,
    reference: `Ref: ${faker.string.alphanumeric(6).toUpperCase()}`,
    is_reconciled: faker.datatype.boolean(0.5),
  };
}

// =============================================================================
// Fixture File Generators
// =============================================================================

function generateTenantFile(tenantConfig: TenantConfig, regionConfig: RegionConfig): any {
  return {
    _meta: {
      description: `${regionConfig.country} tenant with ${regionConfig.taxSystem} tax system`,
      region: tenantConfig.region,
      currency: regionConfig.currency,
      use_cases: [
        `Test ${regionConfig.taxSystem} calculations`,
        `Test ${tenantConfig.region} tax types`,
        `Validate ${tenantConfig.region} Chart of Accounts`,
      ],
    },
    tenant_id: tenantConfig.tenantId,
    xero_tenant_id: faker.string.uuid(),
    org_name: tenantConfig.orgName,
    region: tenantConfig.region,
    currency: regionConfig.currency,
    tax_system: regionConfig.taxSystem,
    granted_scopes: [
      'accounting.transactions',
      'accounting.contacts',
      'accounting.settings',
      'offline_access',
    ],
    connection_status: 'active',
  };
}

function generateAccountsFile(tenantConfig: TenantConfig, regionConfig: RegionConfig): any {
  // Generate stable account IDs based on account type prefix and code
  // This ensures test stability regardless of account ordering
  const typePrefix: Record<string, string> = {
    REVENUE: 'rev',
    EXPENSE: 'exp',
    BANK: 'bank',
    CURRENT: 'cur',
    FIXED: 'fix',
    LIABILITY: 'liab',
    EQUITY: 'eq',
  };

  return {
    _meta: {
      description: `${tenantConfig.region} Chart of Accounts with ${regionConfig.taxSystem} tax types`,
      tenant_id: tenantConfig.tenantId,
      region: tenantConfig.region,
    },
    accounts: regionConfig.chartOfAccounts.map(a => ({
      account_id: `acc-${typePrefix[a.type] || 'oth'}-${a.code}`,
      code: a.code,
      name: a.name,
      type: a.type,
      tax_type: a.taxType,
      description: a.description,
      status: a.status || 'ACTIVE',
    })),
    tax_rates: regionConfig.taxRates.map(t => ({
      name: t.name,
      tax_type: t.taxType,
      rate: t.rate,
      status: t.status,
      description: t.description,
    })),
  };
}

function generateContactsFile(tenantConfig: TenantConfig, regionConfig: RegionConfig, count: number = 20): any {
  const contacts = [];

  // Generate active contacts
  for (let i = 1; i <= count - 2; i++) {
    contacts.push(generateContact(i, regionConfig, 'ACTIVE'));
  }

  // Add an archived contact for testing
  contacts.push({
    contact_id: `contact-${String(count - 1).padStart(3, '0')}`,
    name: 'Old Supplier Co',
    email: 'defunct@oldsupplier.com',
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
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    is_customer: true,
    is_supplier: false,
    status: 'ACTIVE',
    addresses: [generateAddress(regionConfig)],
    phones: [{ type: 'DEFAULT', number: regionConfig.generatePhone() }],
  });

  return {
    _meta: {
      description: `Sample contacts for ${tenantConfig.region} tenant`,
      tenant_id: tenantConfig.tenantId,
      count: contacts.length,
    },
    contacts,
  };
}

function generateInvoicesFile(tenantConfig: TenantConfig, regionConfig: RegionConfig, contacts: any[], accounts: AccountDef[], count: number = 20): any {
  const invoices = [];
  for (let i = 1; i <= count; i++) {
    invoices.push(generateInvoice(i, contacts, accounts, regionConfig, tenantConfig.region));
  }

  return {
    _meta: {
      description: `Sample invoices for ${tenantConfig.region} tenant`,
      tenant_id: tenantConfig.tenantId,
      count: invoices.length,
    },
    invoices,
  };
}

function generateQuotesFile(tenantConfig: TenantConfig, regionConfig: RegionConfig, contacts: any[], accounts: AccountDef[], count: number = 10): any {
  const quotes = [];
  for (let i = 1; i <= count; i++) {
    quotes.push(generateQuote(i, contacts, accounts, regionConfig, tenantConfig.region));
  }

  return {
    _meta: {
      description: `Sample quotes for ${tenantConfig.region} tenant`,
      tenant_id: tenantConfig.tenantId,
      count: quotes.length,
    },
    quotes,
  };
}

function generateCreditNotesFile(tenantConfig: TenantConfig, regionConfig: RegionConfig, contacts: any[], accounts: AccountDef[], count: number = 8): any {
  const creditNotes = [];
  for (let i = 1; i <= count; i++) {
    creditNotes.push(generateCreditNote(i, contacts, accounts, regionConfig, tenantConfig.region));
  }

  return {
    _meta: {
      description: `Sample credit notes for ${tenantConfig.region} tenant`,
      tenant_id: tenantConfig.tenantId,
      count: creditNotes.length,
    },
    credit_notes: creditNotes,
  };
}

function generatePaymentsFile(tenantConfig: TenantConfig, regionConfig: RegionConfig, invoices: any[], accounts: AccountDef[], count: number = 10): any {
  const payments = [];
  for (let i = 1; i <= count; i++) {
    const payment = generatePayment(i, invoices, accounts, regionConfig);
    if (payment) payments.push(payment);
  }

  return {
    _meta: {
      description: `Sample payments for ${tenantConfig.region} tenant`,
      tenant_id: tenantConfig.tenantId,
      count: payments.length,
    },
    payments,
  };
}

function generateBankTransactionsFile(tenantConfig: TenantConfig, regionConfig: RegionConfig, contacts: any[], accounts: AccountDef[], count: number = 15): any {
  const transactions = [];
  for (let i = 1; i <= count; i++) {
    const transaction = generateBankTransaction(i, contacts, accounts, regionConfig, tenantConfig.region);
    if (transaction) transactions.push(transaction);
  }

  return {
    _meta: {
      description: `Sample bank transactions for ${tenantConfig.region} tenant`,
      tenant_id: tenantConfig.tenantId,
      count: transactions.length,
    },
    bank_transactions: transactions,
  };
}

// =============================================================================
// Main Generation Function
// =============================================================================

function main() {
  console.log('Generating test fixtures for all regions...\n');

  for (const tenantConfig of TENANT_CONFIGS) {
    const regionConfig = REGION_CONFIGS[tenantConfig.region];
    console.log(`\n=== Generating ${tenantConfig.region} fixtures (${tenantConfig.tenantId}) ===\n`);

    // Determine file suffix based on region
    const fileSuffix = tenantConfig.region === 'AU' ? 'gst' : tenantConfig.region === 'UK' ? 'vat' : 'startup';

    // Generate tenant
    const tenant = generateTenantFile(tenantConfig, regionConfig);
    const tenantPath = join(FIXTURES_PATH, 'tenants', `${tenantConfig.filePrefix}-${fileSuffix}.json`);
    writeFileSync(tenantPath, JSON.stringify(tenant, null, 2));
    console.log(`  Created: tenants/${tenantConfig.filePrefix}-${fileSuffix}.json`);

    // Generate accounts
    const accountsFixture = generateAccountsFile(tenantConfig, regionConfig);
    const accountsPath = join(FIXTURES_PATH, 'accounts', `${tenantConfig.filePrefix}-chart-of-accounts.json`);
    writeFileSync(accountsPath, JSON.stringify(accountsFixture, null, 2));
    console.log(`  Created: accounts/${tenantConfig.filePrefix}-chart-of-accounts.json (${accountsFixture.accounts.length} accounts)`);

    // Generate contacts
    const contactsFixture = generateContactsFile(tenantConfig, regionConfig, 20);
    const contactsPath = join(FIXTURES_PATH, 'contacts', `${tenantConfig.filePrefix}-contacts.json`);
    writeFileSync(contactsPath, JSON.stringify(contactsFixture, null, 2));
    console.log(`  Created: contacts/${tenantConfig.filePrefix}-contacts.json (${contactsFixture.contacts.length} contacts)`);

    // Generate invoices
    const invoicesFixture = generateInvoicesFile(tenantConfig, regionConfig, contactsFixture.contacts, regionConfig.chartOfAccounts, 20);
    const invoicesPath = join(FIXTURES_PATH, 'invoices', `${tenantConfig.filePrefix}-invoices.json`);
    writeFileSync(invoicesPath, JSON.stringify(invoicesFixture, null, 2));
    console.log(`  Created: invoices/${tenantConfig.filePrefix}-invoices.json (${invoicesFixture.invoices.length} invoices)`);

    // Generate quotes
    const quotesFixture = generateQuotesFile(tenantConfig, regionConfig, contactsFixture.contacts, regionConfig.chartOfAccounts, 10);
    const quotesPath = join(FIXTURES_PATH, 'quotes', `${tenantConfig.filePrefix}-quotes.json`);
    writeFileSync(quotesPath, JSON.stringify(quotesFixture, null, 2));
    console.log(`  Created: quotes/${tenantConfig.filePrefix}-quotes.json (${quotesFixture.quotes.length} quotes)`);

    // Generate credit notes
    const creditNotesFixture = generateCreditNotesFile(tenantConfig, regionConfig, contactsFixture.contacts, regionConfig.chartOfAccounts, 8);
    const creditNotesPath = join(FIXTURES_PATH, 'credit-notes', `${tenantConfig.filePrefix}-credit-notes.json`);
    writeFileSync(creditNotesPath, JSON.stringify(creditNotesFixture, null, 2));
    console.log(`  Created: credit-notes/${tenantConfig.filePrefix}-credit-notes.json (${creditNotesFixture.credit_notes.length} credit notes)`);

    // Generate payments
    const paymentsFixture = generatePaymentsFile(tenantConfig, regionConfig, invoicesFixture.invoices, regionConfig.chartOfAccounts, 10);
    const paymentsPath = join(FIXTURES_PATH, 'payments', `${tenantConfig.filePrefix}-payments.json`);
    writeFileSync(paymentsPath, JSON.stringify(paymentsFixture, null, 2));
    console.log(`  Created: payments/${tenantConfig.filePrefix}-payments.json (${paymentsFixture.payments.length} payments)`);

    // Generate bank transactions
    const bankTransactionsFixture = generateBankTransactionsFile(tenantConfig, regionConfig, contactsFixture.contacts, regionConfig.chartOfAccounts, 15);
    const bankTransactionsPath = join(FIXTURES_PATH, 'bank-transactions', `${tenantConfig.filePrefix}-bank-transactions.json`);
    writeFileSync(bankTransactionsPath, JSON.stringify(bankTransactionsFixture, null, 2));
    console.log(`  Created: bank-transactions/${tenantConfig.filePrefix}-bank-transactions.json (${bankTransactionsFixture.bank_transactions.length} transactions)`);
  }

  console.log('\n=== Fixture generation complete! ===\n');
  console.log('Summary:');
  console.log('  - 3 tenants (AU, UK, US)');
  console.log('  - 24 fixture files total');
  console.log('  - ~60 contacts, ~60 invoices, ~30 quotes');
  console.log('  - ~24 credit notes, ~30 payments, ~45 bank transactions');
}

main();
