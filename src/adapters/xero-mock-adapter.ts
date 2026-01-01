import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  XeroAdapter,
  TenantContext,
  Account,
  TaxRate,
  Contact,
  Invoice,
  Quote,
  CreditNote,
  Payment,
  BankTransaction,
  InvoiceFilter,
  ContactFilter,
  AccountFilter,
  QuoteFilter,
  CreditNoteFilter,
  PaymentFilter,
  BankTransactionFilter,
  ValidationResult,
  ValidationDiff,
} from './adapter-interface.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '..', '..', 'test', 'fixtures');

interface TenantFixture {
  _meta: { description: string; region: string; currency: string };
  tenant_id: string;
  xero_tenant_id: string;
  org_name: string;
  region: string;
  currency: string;
  tax_system: string;
  granted_scopes: string[];
  connection_status: string;
}

interface AccountsFixture {
  _meta: { description: string; tenant_id: string; region: string };
  accounts: Account[];
  tax_rates: TaxRate[];
}

interface ContactsFixture {
  _meta: { description: string; tenant_id: string; count: number };
  contacts: Contact[];
}

interface InvoicesFixture {
  _meta: { description: string; tenant_id: string; count: number };
  invoices: Invoice[];
}

interface QuotesFixture {
  _meta: { description: string; tenant_id: string; count: number };
  quotes: Quote[];
}

interface CreditNotesFixture {
  _meta: { description: string; tenant_id: string; count: number };
  credit_notes: CreditNote[];
}

interface PaymentsFixture {
  _meta: { description: string; tenant_id: string; count: number };
  payments: Payment[];
}

interface BankTransactionsFixture {
  _meta: { description: string; tenant_id: string; count: number };
  bank_transactions: BankTransaction[];
}

/**
 * Mock adapter that reads from test fixtures instead of calling the Xero API.
 * Used for testing and development without live Xero credentials.
 */
export class XeroMockAdapter implements XeroAdapter {
  private tenants: Map<string, TenantFixture> = new Map();
  private accounts: Map<string, Account[]> = new Map();
  private taxRates: Map<string, TaxRate[]> = new Map();
  private contacts: Map<string, Contact[]> = new Map();
  private invoices: Map<string, Invoice[]> = new Map();
  private quotes: Map<string, Quote[]> = new Map();
  private creditNotes: Map<string, CreditNote[]> = new Map();
  private payments: Map<string, Payment[]> = new Map();
  private bankTransactions: Map<string, BankTransaction[]> = new Map();

  constructor() {
    this.loadFixtures();
  }

  getMode(): 'mock' | 'live' {
    return 'mock';
  }

  private loadFixtures(): void {
    // Load all tenant fixtures dynamically
    const tenantsDir = join(FIXTURES_PATH, 'tenants');
    if (existsSync(tenantsDir)) {
      const tenantFiles = readdirSync(tenantsDir).filter(f => f.endsWith('.json'));
      for (const tenantFile of tenantFiles) {
        const tenantPath = join(tenantsDir, tenantFile);
        const tenant = JSON.parse(readFileSync(tenantPath, 'utf-8')) as TenantFixture;
        this.tenants.set(tenant.tenant_id, tenant);
      }
    }

    // Load accounts and tax rates for all tenants
    const accountsDir = join(FIXTURES_PATH, 'accounts');
    if (existsSync(accountsDir)) {
      const accountFiles = readdirSync(accountsDir).filter(f => f.endsWith('.json'));
      for (const file of accountFiles) {
        const data = JSON.parse(readFileSync(join(accountsDir, file), 'utf-8')) as AccountsFixture;
        const tenantId = data._meta.tenant_id;
        this.accounts.set(tenantId, data.accounts);
        this.taxRates.set(tenantId, data.tax_rates);
      }
    }

    // Load contacts for all tenants
    const contactsDir = join(FIXTURES_PATH, 'contacts');
    if (existsSync(contactsDir)) {
      const contactFiles = readdirSync(contactsDir).filter(f => f.endsWith('.json'));
      for (const file of contactFiles) {
        const data = JSON.parse(readFileSync(join(contactsDir, file), 'utf-8')) as ContactsFixture;
        const tenantId = data._meta.tenant_id;
        this.contacts.set(tenantId, data.contacts);
      }
    }

    // Load invoices for all tenants
    const invoicesDir = join(FIXTURES_PATH, 'invoices');
    if (existsSync(invoicesDir)) {
      const invoiceFiles = readdirSync(invoicesDir).filter(f => f.endsWith('.json'));
      for (const file of invoiceFiles) {
        const data = JSON.parse(readFileSync(join(invoicesDir, file), 'utf-8')) as InvoicesFixture;
        const tenantId = data._meta.tenant_id;
        this.invoices.set(tenantId, data.invoices);
      }
    }

    // Load quotes for all tenants
    const quotesDir = join(FIXTURES_PATH, 'quotes');
    if (existsSync(quotesDir)) {
      const quoteFiles = readdirSync(quotesDir).filter(f => f.endsWith('.json'));
      for (const file of quoteFiles) {
        const data = JSON.parse(readFileSync(join(quotesDir, file), 'utf-8')) as QuotesFixture;
        const tenantId = data._meta.tenant_id;
        this.quotes.set(tenantId, data.quotes);
      }
    }

    // Load credit notes for all tenants
    const creditNotesDir = join(FIXTURES_PATH, 'credit-notes');
    if (existsSync(creditNotesDir)) {
      const creditNoteFiles = readdirSync(creditNotesDir).filter(f => f.endsWith('.json'));
      for (const file of creditNoteFiles) {
        const data = JSON.parse(readFileSync(join(creditNotesDir, file), 'utf-8')) as CreditNotesFixture;
        const tenantId = data._meta.tenant_id;
        this.creditNotes.set(tenantId, data.credit_notes);
      }
    }

    // Load payments for all tenants
    const paymentsDir = join(FIXTURES_PATH, 'payments');
    if (existsSync(paymentsDir)) {
      const paymentFiles = readdirSync(paymentsDir).filter(f => f.endsWith('.json'));
      for (const file of paymentFiles) {
        const data = JSON.parse(readFileSync(join(paymentsDir, file), 'utf-8')) as PaymentsFixture;
        const tenantId = data._meta.tenant_id;
        this.payments.set(tenantId, data.payments);
      }
    }

    // Load bank transactions for all tenants
    const bankTransactionsDir = join(FIXTURES_PATH, 'bank-transactions');
    if (existsSync(bankTransactionsDir)) {
      const bankTxFiles = readdirSync(bankTransactionsDir).filter(f => f.endsWith('.json'));
      for (const file of bankTxFiles) {
        const data = JSON.parse(readFileSync(join(bankTransactionsDir, file), 'utf-8')) as BankTransactionsFixture;
        const tenantId = data._meta.tenant_id;
        this.bankTransactions.set(tenantId, data.bank_transactions);
      }
    }

    // Log summary for all loaded tenants
    let totalAccounts = 0;
    let totalContacts = 0;
    let totalInvoices = 0;
    let totalQuotes = 0;
    let totalCreditNotes = 0;
    let totalPayments = 0;
    let totalBankTx = 0;

    for (const tenantId of this.tenants.keys()) {
      totalAccounts += this.accounts.get(tenantId)?.length ?? 0;
      totalContacts += this.contacts.get(tenantId)?.length ?? 0;
      totalInvoices += this.invoices.get(tenantId)?.length ?? 0;
      totalQuotes += this.quotes.get(tenantId)?.length ?? 0;
      totalCreditNotes += this.creditNotes.get(tenantId)?.length ?? 0;
      totalPayments += this.payments.get(tenantId)?.length ?? 0;
      totalBankTx += this.bankTransactions.get(tenantId)?.length ?? 0;
    }

    console.error(`[XeroMockAdapter] Loaded ${this.tenants.size} tenant(s), ` +
      `${totalAccounts} accounts, ${totalContacts} contacts, ${totalInvoices} invoices, ` +
      `${totalQuotes} quotes, ${totalCreditNotes} credit notes, ${totalPayments} payments, ` +
      `${totalBankTx} bank transactions`);
  }

  async getTenants(): Promise<Array<{ tenant_id: string; tenant_name: string; region: string }>> {
    return Array.from(this.tenants.values()).map(t => ({
      tenant_id: t.tenant_id,
      tenant_name: t.org_name,
      region: t.region,
    }));
  }

  async getTenantContext(tenantId: string): Promise<TenantContext> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    return {
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.org_name,
      region: tenant.region,
      currency: tenant.currency,
      accounts: this.accounts.get(tenantId) ?? [],
      tax_rates: this.taxRates.get(tenantId) ?? [],
      contacts: this.contacts.get(tenantId) ?? [],
    };
  }

  async getAccounts(tenantId: string, filter?: AccountFilter): Promise<Account[]> {
    let accounts = this.accounts.get(tenantId) ?? [];

    if (filter?.type) {
      accounts = accounts.filter(a => a.type === filter.type);
    }
    if (filter?.status) {
      accounts = accounts.filter(a => a.status === filter.status);
    }

    return accounts;
  }

  async getTaxRates(tenantId: string): Promise<TaxRate[]> {
    return this.taxRates.get(tenantId) ?? [];
  }

  async getContacts(tenantId: string, filter?: ContactFilter): Promise<Contact[]> {
    let contacts = this.contacts.get(tenantId) ?? [];

    if (filter?.is_customer !== undefined) {
      contacts = contacts.filter(c => c.is_customer === filter.is_customer);
    }
    if (filter?.is_supplier !== undefined) {
      contacts = contacts.filter(c => c.is_supplier === filter.is_supplier);
    }
    if (filter?.status) {
      contacts = contacts.filter(c => c.status === filter.status);
    }

    return contacts;
  }

  async getInvoices(tenantId: string, filter?: InvoiceFilter): Promise<Invoice[]> {
    let invoices = this.invoices.get(tenantId) ?? [];

    if (filter?.status) {
      invoices = invoices.filter(i => i.status === filter.status);
    }
    if (filter?.contact_id) {
      invoices = invoices.filter(i => i.contact.contact_id === filter.contact_id);
    }
    if (filter?.from_date) {
      invoices = invoices.filter(i => i.date !== undefined && i.date >= filter.from_date!);
    }
    if (filter?.to_date) {
      invoices = invoices.filter(i => i.date !== undefined && i.date <= filter.to_date!);
    }

    return invoices;
  }

  async validateInvoice(tenantId: string, invoice: Partial<Invoice>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const diff: ValidationDiff[] = [];

    const accounts = this.accounts.get(tenantId) ?? [];
    const taxRates = this.taxRates.get(tenantId) ?? [];
    const contacts = this.contacts.get(tenantId) ?? [];
    const tenant = this.tenants.get(tenantId);

    // Validate contact exists
    if (invoice.contact?.contact_id) {
      const contact = contacts.find(c => c.contact_id === invoice.contact!.contact_id);
      if (!contact) {
        errors.push(`Contact '${invoice.contact.contact_id}' not found`);
        diff.push({
          field: 'contact.contact_id',
          issue: 'Contact not found in tenant',
          received: invoice.contact.contact_id,
          severity: 'error',
        });
      } else if (contact.status === 'ARCHIVED') {
        warnings.push(`Contact '${contact.name}' is ARCHIVED - invoice may fail`);
        diff.push({
          field: 'contact.contact_id',
          issue: 'Contact is archived',
          received: contact.name,
          severity: 'warning',
        });
      }
    }

    // Validate line items
    if (invoice.line_items) {
      for (let i = 0; i < invoice.line_items.length; i++) {
        const line = invoice.line_items[i];

        // Validate AccountCode exists and is active
        const account = accounts.find(a => a.code === line.account_code);
        if (!account) {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' does not exist in tenant's Chart of Accounts`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account code not found',
            expected: 'Valid account code from Chart of Accounts',
            received: line.account_code,
            severity: 'error',
          });
        } else if (account.status === 'ARCHIVED') {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' is ARCHIVED`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account is archived',
            expected: 'ACTIVE account',
            received: `${line.account_code} (${account.name}) - ARCHIVED`,
            severity: 'error',
          });
        } else {
          // Check account type is appropriate for invoice type
          if (invoice.type === 'ACCREC' && account.type !== 'REVENUE') {
            warnings.push(`LineItems[${i}].account_code '${line.account_code}' is ${account.type}, not REVENUE. This may cause incorrect reporting.`);
            diff.push({
              field: `line_items[${i}].account_code`,
              issue: 'Account type mismatch for sales invoice',
              expected: 'REVENUE account',
              received: `${account.type} account`,
              severity: 'warning',
            });
          }
        }

        // Validate TaxType
        if (line.tax_type) {
          const taxRate = taxRates.find(t => t.tax_type === line.tax_type && t.status === 'ACTIVE');
          if (!taxRate) {
            errors.push(`LineItems[${i}].tax_type '${line.tax_type}' is not valid for ${tenant?.region ?? 'this'} region`);
            diff.push({
              field: `line_items[${i}].tax_type`,
              issue: 'Invalid tax type for region',
              expected: `Valid ${tenant?.region ?? ''} tax type (OUTPUT, INPUT, EXEMPTOUTPUT, EXEMPTINPUT, BASEXCLUDED)`,
              received: line.tax_type,
              severity: 'error',
            });
          }
        }

        // Validate quantities and amounts
        if (line.quantity <= 0) {
          errors.push(`LineItems[${i}].quantity must be positive`);
          diff.push({
            field: `line_items[${i}].quantity`,
            issue: 'Invalid quantity',
            expected: 'Positive number',
            received: String(line.quantity),
            severity: 'error',
          });
        }
      }
    }

    // Calculate score
    const totalChecks = (invoice.line_items?.length ?? 0) * 3 + 1; // 3 checks per line + contact check
    const failedChecks = errors.length;
    const score = totalChecks > 0 ? Math.max(0, 1 - (failedChecks / totalChecks)) : 1;

    return {
      valid: errors.length === 0,
      score,
      errors,
      warnings,
      diff,
    };
  }

  async validateContact(_tenantId: string, contact: Partial<Contact>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const diff: ValidationDiff[] = [];

    // Basic validation
    if (!contact.name || contact.name.trim().length === 0) {
      errors.push('Contact name is required');
      diff.push({
        field: 'name',
        issue: 'Required field missing',
        expected: 'Non-empty string',
        received: contact.name ?? 'undefined',
        severity: 'error',
      });
    }

    if (contact.email && !contact.email.includes('@')) {
      errors.push('Invalid email format');
      diff.push({
        field: 'email',
        issue: 'Invalid email format',
        expected: 'Valid email address',
        received: contact.email,
        severity: 'error',
      });
    }

    const score = errors.length === 0 ? 1.0 : 0.0;

    return {
      valid: errors.length === 0,
      score,
      errors,
      warnings,
      diff,
    };
  }

  // ============================================================================
  // Quote methods
  // ============================================================================

  async getQuotes(tenantId: string, filter?: QuoteFilter): Promise<Quote[]> {
    let quotes = this.quotes.get(tenantId) ?? [];

    if (filter?.status) {
      quotes = quotes.filter(q => q.status === filter.status);
    }
    if (filter?.contact_id) {
      quotes = quotes.filter(q => q.contact.contact_id === filter.contact_id);
    }
    if (filter?.from_date) {
      quotes = quotes.filter(q => q.date >= filter.from_date!);
    }
    if (filter?.to_date) {
      quotes = quotes.filter(q => q.date <= filter.to_date!);
    }

    return quotes;
  }

  async validateQuote(tenantId: string, quote: Partial<Quote>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const diff: ValidationDiff[] = [];

    const accounts = this.accounts.get(tenantId) ?? [];
    const taxRates = this.taxRates.get(tenantId) ?? [];
    const contacts = this.contacts.get(tenantId) ?? [];

    // Validate contact exists
    if (quote.contact?.contact_id) {
      const contact = contacts.find(c => c.contact_id === quote.contact!.contact_id);
      if (!contact) {
        errors.push(`Contact '${quote.contact.contact_id}' not found`);
        diff.push({
          field: 'contact.contact_id',
          issue: 'Contact not found in tenant',
          received: quote.contact.contact_id,
          severity: 'error',
        });
      }
    }

    // Validate line items (similar to invoice)
    if (quote.line_items) {
      for (let i = 0; i < quote.line_items.length; i++) {
        const line = quote.line_items[i];
        const account = accounts.find(a => a.code === line.account_code);
        if (!account) {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' not found`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account code not found',
            received: line.account_code,
            severity: 'error',
          });
        } else if (account.status === 'ARCHIVED') {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' is ARCHIVED`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account is archived',
            received: line.account_code,
            severity: 'error',
          });
        }

        if (line.tax_type) {
          const taxRate = taxRates.find(t => t.tax_type === line.tax_type && t.status === 'ACTIVE');
          if (!taxRate) {
            errors.push(`LineItems[${i}].tax_type '${line.tax_type}' is invalid`);
            diff.push({
              field: `line_items[${i}].tax_type`,
              issue: 'Invalid tax type',
              received: line.tax_type,
              severity: 'error',
            });
          }
        }
      }
    }

    const totalChecks = (quote.line_items?.length ?? 0) * 2 + 1;
    const score = totalChecks > 0 ? Math.max(0, 1 - (errors.length / totalChecks)) : 1;

    return { valid: errors.length === 0, score, errors, warnings, diff };
  }

  // ============================================================================
  // Credit Note methods
  // ============================================================================

  async getCreditNotes(tenantId: string, filter?: CreditNoteFilter): Promise<CreditNote[]> {
    let creditNotes = this.creditNotes.get(tenantId) ?? [];

    if (filter?.type) {
      creditNotes = creditNotes.filter(cn => cn.type === filter.type);
    }
    if (filter?.status) {
      creditNotes = creditNotes.filter(cn => cn.status === filter.status);
    }
    if (filter?.contact_id) {
      creditNotes = creditNotes.filter(cn => cn.contact.contact_id === filter.contact_id);
    }

    return creditNotes;
  }

  async validateCreditNote(tenantId: string, creditNote: Partial<CreditNote>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const diff: ValidationDiff[] = [];

    const accounts = this.accounts.get(tenantId) ?? [];
    const taxRates = this.taxRates.get(tenantId) ?? [];
    const contacts = this.contacts.get(tenantId) ?? [];

    // Validate type
    if (creditNote.type && !['ACCRECCREDIT', 'ACCPAYCREDIT'].includes(creditNote.type)) {
      errors.push(`Invalid credit note type '${creditNote.type}'`);
      diff.push({
        field: 'type',
        issue: 'Invalid credit note type',
        expected: 'ACCRECCREDIT or ACCPAYCREDIT',
        received: creditNote.type,
        severity: 'error',
      });
    }

    // Validate contact
    if (creditNote.contact?.contact_id) {
      const contact = contacts.find(c => c.contact_id === creditNote.contact!.contact_id);
      if (!contact) {
        errors.push(`Contact '${creditNote.contact.contact_id}' not found`);
        diff.push({
          field: 'contact.contact_id',
          issue: 'Contact not found',
          received: creditNote.contact.contact_id,
          severity: 'error',
        });
      } else if (contact.status === 'ARCHIVED') {
        errors.push(`Contact '${creditNote.contact.contact_id}' is ARCHIVED`);
        diff.push({
          field: 'contact.contact_id',
          issue: 'Contact is archived',
          received: creditNote.contact.contact_id,
          severity: 'error',
        });
      }
    }

    // Validate line items
    if (creditNote.line_items) {
      for (let i = 0; i < creditNote.line_items.length; i++) {
        const line = creditNote.line_items[i];
        const account = accounts.find(a => a.code === line.account_code);
        if (!account) {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' not found`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account code not found',
            received: line.account_code,
            severity: 'error',
          });
        } else if (account.status === 'ARCHIVED') {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' is ARCHIVED`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account is archived',
            received: line.account_code,
            severity: 'error',
          });
        }

        if (line.tax_type) {
          const taxRate = taxRates.find(t => t.tax_type === line.tax_type && t.status === 'ACTIVE');
          if (!taxRate) {
            errors.push(`LineItems[${i}].tax_type '${line.tax_type}' is invalid`);
            diff.push({
              field: `line_items[${i}].tax_type`,
              issue: 'Invalid tax type',
              received: line.tax_type,
              severity: 'error',
            });
          }
        }
      }
    }

    const totalChecks = (creditNote.line_items?.length ?? 0) * 2 + 2;
    const score = totalChecks > 0 ? Math.max(0, 1 - (errors.length / totalChecks)) : 1;

    return { valid: errors.length === 0, score, errors, warnings, diff };
  }

  // ============================================================================
  // Payment methods
  // ============================================================================

  async getPayments(tenantId: string, filter?: PaymentFilter): Promise<Payment[]> {
    let payments = this.payments.get(tenantId) ?? [];

    if (filter?.invoice_id) {
      payments = payments.filter(p => p.invoice?.invoice_id === filter.invoice_id);
    }
    if (filter?.from_date) {
      payments = payments.filter(p => p.date >= filter.from_date!);
    }
    if (filter?.to_date) {
      payments = payments.filter(p => p.date <= filter.to_date!);
    }

    return payments;
  }

  async validatePayment(tenantId: string, payment: Partial<Payment>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const diff: ValidationDiff[] = [];

    const invoices = this.invoices.get(tenantId) ?? [];
    const accounts = this.accounts.get(tenantId) ?? [];

    // Validate invoice or credit note exists
    if (payment.invoice?.invoice_id) {
      const invoice = invoices.find(i => i.invoice_id === payment.invoice!.invoice_id);
      if (!invoice) {
        errors.push(`Invoice '${payment.invoice.invoice_id}' not found`);
        diff.push({
          field: 'invoice.invoice_id',
          issue: 'Invoice not found',
          received: payment.invoice.invoice_id,
          severity: 'error',
        });
      } else if (invoice.status === 'PAID') {
        warnings.push(`Invoice '${payment.invoice.invoice_id}' is already paid`);
        diff.push({
          field: 'invoice.invoice_id',
          issue: 'Invoice already paid',
          received: payment.invoice.invoice_id,
          severity: 'warning',
        });
      } else if (invoice.status === 'DRAFT') {
        errors.push(`Invoice '${payment.invoice.invoice_id}' is in DRAFT status - cannot apply payment`);
        diff.push({
          field: 'invoice.invoice_id',
          issue: 'Cannot pay draft invoice',
          received: payment.invoice.invoice_id,
          severity: 'error',
        });
      }
    }

    // Validate bank account
    if (payment.account?.account_id) {
      const account = accounts.find(a => a.account_id === payment.account!.account_id);
      if (!account) {
        errors.push(`Account '${payment.account.account_id}' not found`);
        diff.push({
          field: 'account.account_id',
          issue: 'Bank account not found',
          received: payment.account.account_id,
          severity: 'error',
        });
      } else if (account.type !== 'BANK') {
        errors.push(`Account '${payment.account.account_id}' is not a BANK account`);
        diff.push({
          field: 'account.account_id',
          issue: 'Not a bank account',
          expected: 'BANK account',
          received: account.type,
          severity: 'error',
        });
      }
    }

    // Validate amount
    if (payment.amount !== undefined && payment.amount <= 0) {
      errors.push('Payment amount must be positive');
      diff.push({
        field: 'amount',
        issue: 'Invalid amount',
        expected: 'Positive number',
        received: String(payment.amount),
        severity: 'error',
      });
    }

    const score = errors.length === 0 ? 1.0 : Math.max(0, 1 - (errors.length / 3));

    return { valid: errors.length === 0, score, errors, warnings, diff };
  }

  // ============================================================================
  // Bank Transaction methods
  // ============================================================================

  async getBankTransactions(tenantId: string, filter?: BankTransactionFilter): Promise<BankTransaction[]> {
    let transactions = this.bankTransactions.get(tenantId) ?? [];

    if (filter?.type) {
      transactions = transactions.filter(t => t.type === filter.type);
    }
    if (filter?.status) {
      transactions = transactions.filter(t => t.status === filter.status);
    }
    if (filter?.bank_account_id) {
      transactions = transactions.filter(t => t.bank_account.account_id === filter.bank_account_id);
    }
    if (filter?.is_reconciled !== undefined) {
      transactions = transactions.filter(t => t.is_reconciled === filter.is_reconciled);
    }

    return transactions;
  }

  async validateBankTransaction(tenantId: string, transaction: Partial<BankTransaction>): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const diff: ValidationDiff[] = [];

    const accounts = this.accounts.get(tenantId) ?? [];
    const taxRates = this.taxRates.get(tenantId) ?? [];
    const contacts = this.contacts.get(tenantId) ?? [];

    // Validate type
    const validTypes = ['RECEIVE', 'SPEND', 'RECEIVE-OVERPAYMENT', 'RECEIVE-PREPAYMENT', 'SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT'];
    if (transaction.type && !validTypes.includes(transaction.type)) {
      errors.push(`Invalid transaction type '${transaction.type}'`);
      diff.push({
        field: 'type',
        issue: 'Invalid transaction type',
        expected: validTypes.join(', '),
        received: transaction.type,
        severity: 'error',
      });
    }

    // Validate bank account
    if (transaction.bank_account?.account_id) {
      const account = accounts.find(a => a.account_id === transaction.bank_account!.account_id);
      if (!account) {
        errors.push(`Bank account '${transaction.bank_account.account_id}' not found`);
        diff.push({
          field: 'bank_account.account_id',
          issue: 'Bank account not found',
          received: transaction.bank_account.account_id,
          severity: 'error',
        });
      } else if (account.type !== 'BANK') {
        errors.push(`Account '${transaction.bank_account.account_id}' is not a BANK account`);
        diff.push({
          field: 'bank_account.account_id',
          issue: 'Not a bank account',
          expected: 'BANK account',
          received: account.type,
          severity: 'error',
        });
      }
    }

    // Validate contact if provided
    if (transaction.contact?.contact_id) {
      const contact = contacts.find(c => c.contact_id === transaction.contact!.contact_id);
      if (!contact) {
        errors.push(`Contact '${transaction.contact.contact_id}' not found`);
        diff.push({
          field: 'contact.contact_id',
          issue: 'Contact not found',
          received: transaction.contact.contact_id,
          severity: 'error',
        });
      }
    }

    // Validate line items
    if (transaction.line_items) {
      for (let i = 0; i < transaction.line_items.length; i++) {
        const line = transaction.line_items[i];
        const account = accounts.find(a => a.code === line.account_code);
        if (!account) {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' not found`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account code not found',
            received: line.account_code,
            severity: 'error',
          });
        } else if (account.status === 'ARCHIVED') {
          errors.push(`LineItems[${i}].account_code '${line.account_code}' is ARCHIVED`);
          diff.push({
            field: `line_items[${i}].account_code`,
            issue: 'Account is archived',
            received: line.account_code,
            severity: 'error',
          });
        }

        if (line.tax_type) {
          const taxRate = taxRates.find(t => t.tax_type === line.tax_type && t.status === 'ACTIVE');
          if (!taxRate) {
            errors.push(`LineItems[${i}].tax_type '${line.tax_type}' is invalid`);
            diff.push({
              field: `line_items[${i}].tax_type`,
              issue: 'Invalid tax type',
              received: line.tax_type,
              severity: 'error',
            });
          }
        }
      }
    }

    const totalChecks = (transaction.line_items?.length ?? 0) * 2 + 3;
    const score = totalChecks > 0 ? Math.max(0, 1 - (errors.length / totalChecks)) : 1;

    return { valid: errors.length === 0, score, errors, warnings, diff };
  }

  // ============================================================================
  // Create Methods
  // ============================================================================

  async createContact(tenantId: string, contact: Partial<Contact>): Promise<Contact> {
    const newContact: Contact = {
      contact_id: contact.contact_id || `contact-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: contact.name || 'New Contact',
      email: contact.email,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone: contact.phone,
      is_customer: contact.is_customer ?? true,
      is_supplier: contact.is_supplier ?? false,
      status: 'ACTIVE',
      addresses: contact.addresses,
      phones: contact.phones,
    };

    const contacts = this.contacts.get(tenantId) ?? [];
    contacts.push(newContact);
    this.contacts.set(tenantId, contacts);

    return newContact;
  }

  async createInvoice(tenantId: string, invoice: Partial<Invoice>): Promise<Invoice> {
    const newInvoice: Invoice = {
      invoice_id: invoice.invoice_id || `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: invoice.type || 'ACCREC',
      contact: invoice.contact || { contact_id: '' },
      date: invoice.date || new Date().toISOString().split('T')[0],
      due_date: invoice.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: invoice.status || 'DRAFT',
      line_amount_types: invoice.line_amount_types || 'Exclusive',
      line_items: invoice.line_items || [],
      currency_code: invoice.currency_code || 'AUD',
      sub_total: invoice.sub_total || 0,
      total_tax: invoice.total_tax || 0,
      total: invoice.total || 0,
    };

    const invoices = this.invoices.get(tenantId) ?? [];
    invoices.push(newInvoice);
    this.invoices.set(tenantId, invoices);

    return newInvoice;
  }

  async createQuote(tenantId: string, quote: Partial<Quote>): Promise<Quote> {
    const newQuote: Quote = {
      quote_id: quote.quote_id || `quote-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      quote_number: quote.quote_number || `QU-${String(Date.now()).slice(-6)}`,
      contact: quote.contact || { contact_id: '' },
      date: quote.date || new Date().toISOString().split('T')[0],
      expiry_date: quote.expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: quote.status || 'DRAFT',
      line_amount_types: quote.line_amount_types || 'Exclusive',
      line_items: quote.line_items || [],
      currency_code: quote.currency_code || 'AUD',
      sub_total: quote.sub_total || 0,
      total_tax: quote.total_tax || 0,
      total: quote.total || 0,
      title: quote.title,
      summary: quote.summary,
      terms: quote.terms,
    };

    const quotes = this.quotes.get(tenantId) ?? [];
    quotes.push(newQuote);
    this.quotes.set(tenantId, quotes);

    return newQuote;
  }

  async createCreditNote(tenantId: string, creditNote: Partial<CreditNote>): Promise<CreditNote> {
    const newCreditNote: CreditNote = {
      credit_note_id: creditNote.credit_note_id || `cn-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      credit_note_number: creditNote.credit_note_number || `CN-${String(Date.now()).slice(-6)}`,
      type: creditNote.type || 'ACCRECCREDIT',
      contact: creditNote.contact || { contact_id: '' },
      date: creditNote.date || new Date().toISOString().split('T')[0],
      status: creditNote.status || 'DRAFT',
      line_amount_types: creditNote.line_amount_types || 'Exclusive',
      line_items: creditNote.line_items || [],
      currency_code: creditNote.currency_code || 'AUD',
      sub_total: creditNote.sub_total || 0,
      total_tax: creditNote.total_tax || 0,
      total: creditNote.total || 0,
      remaining_credit: creditNote.remaining_credit || creditNote.total || 0,
      reference: creditNote.reference,
    };

    const creditNotes = this.creditNotes.get(tenantId) ?? [];
    creditNotes.push(newCreditNote);
    this.creditNotes.set(tenantId, creditNotes);

    return newCreditNote;
  }

  async createPayment(tenantId: string, payment: Partial<Payment>): Promise<Payment> {
    const newPayment: Payment = {
      payment_id: payment.payment_id || `pay-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      invoice: payment.invoice,
      credit_note: payment.credit_note,
      account: payment.account || { account_id: '' },
      date: payment.date || new Date().toISOString().split('T')[0],
      amount: payment.amount || 0,
      currency_code: payment.currency_code || 'AUD',
      reference: payment.reference,
      status: payment.status || 'AUTHORISED',
    };

    const payments = this.payments.get(tenantId) ?? [];
    payments.push(newPayment);
    this.payments.set(tenantId, payments);

    return newPayment;
  }

  async createBankTransaction(tenantId: string, transaction: Partial<BankTransaction>): Promise<BankTransaction> {
    const newTransaction: BankTransaction = {
      bank_transaction_id: transaction.bank_transaction_id || `bt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: transaction.type || 'RECEIVE',
      contact: transaction.contact,
      bank_account: transaction.bank_account || { account_id: '' },
      date: transaction.date || new Date().toISOString().split('T')[0],
      status: transaction.status || 'DRAFT',
      line_amount_types: transaction.line_amount_types || 'Exclusive',
      line_items: transaction.line_items || [],
      currency_code: transaction.currency_code || 'AUD',
      sub_total: transaction.sub_total || 0,
      total_tax: transaction.total_tax || 0,
      total: transaction.total || 0,
      reference: transaction.reference,
      is_reconciled: transaction.is_reconciled || false,
    };

    const transactions = this.bankTransactions.get(tenantId) ?? [];
    transactions.push(newTransaction);
    this.bankTransactions.set(tenantId, transactions);

    return newTransaction;
  }

  // ============================================================================
  // Update Methods
  // ============================================================================

  async updateEntityStatus(
    tenantId: string,
    entityType: 'Invoice' | 'Quote' | 'CreditNote',
    entityId: string,
    newStatus: string
  ): Promise<void> {
    switch (entityType) {
      case 'Invoice': {
        const invoices = this.invoices.get(tenantId) ?? [];
        const invoice = invoices.find(i => i.invoice_id === entityId);
        if (!invoice) {
          throw new Error(`Invoice '${entityId}' not found`);
        }
        invoice.status = newStatus as Invoice['status'];
        break;
      }
      case 'Quote': {
        const quotes = this.quotes.get(tenantId) ?? [];
        const quote = quotes.find(q => q.quote_id === entityId);
        if (!quote) {
          throw new Error(`Quote '${entityId}' not found`);
        }
        quote.status = newStatus as Quote['status'];
        break;
      }
      case 'CreditNote': {
        const creditNotes = this.creditNotes.get(tenantId) ?? [];
        const creditNote = creditNotes.find(cn => cn.credit_note_id === entityId);
        if (!creditNote) {
          throw new Error(`CreditNote '${entityId}' not found`);
        }
        creditNote.status = newStatus as CreditNote['status'];
        break;
      }
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }
}
