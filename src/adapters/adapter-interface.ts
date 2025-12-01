/**
 * Xero Adapter Interface
 * Defines the contract for interacting with Xero data, whether from
 * mock fixtures or the live Xero API.
 */

// ============================================================================
// Entity Types
// ============================================================================

export interface Contact {
  contact_id: string;
  name: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_customer: boolean;
  is_supplier: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  addresses?: Address[];
  phones?: Phone[];
}

export interface Address {
  type: 'STREET' | 'POBOX';
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
}

export interface Phone {
  type: 'DEFAULT' | 'DDI' | 'MOBILE' | 'FAX';
  number: string;
}

export interface Account {
  account_id: string;
  code: string;
  name: string;
  type: 'REVENUE' | 'EXPENSE' | 'BANK' | 'CURRENT' | 'FIXED' | 'LIABILITY' | 'EQUITY';
  tax_type?: string | null;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface TaxRate {
  name: string;
  tax_type: string;
  rate: number;
  status: 'ACTIVE' | 'DELETED';
  description?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_amount: number;
  account_code: string;
  tax_type?: string;
}

export interface Invoice {
  invoice_id: string;
  type: 'ACCREC' | 'ACCPAY';
  contact: { contact_id: string };
  date: string;
  due_date: string;
  status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED';
  line_amount_types: 'Exclusive' | 'Inclusive' | 'NoTax';
  line_items: LineItem[];
  currency_code: string;
  sub_total: number;
  total_tax: number;
  total: number;
}

export interface Quote {
  quote_id: string;
  quote_number: string;
  contact: { contact_id: string };
  date: string;
  expiry_date: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'INVOICED';
  line_amount_types: 'Exclusive' | 'Inclusive' | 'NoTax';
  line_items: LineItem[];
  currency_code: string;
  sub_total: number;
  total_tax: number;
  total: number;
  title?: string;
  summary?: string;
  terms?: string;
}

export interface CreditNote {
  credit_note_id: string;
  credit_note_number: string;
  type: 'ACCRECCREDIT' | 'ACCPAYCREDIT';
  contact: { contact_id: string };
  date: string;
  status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED';
  line_amount_types: 'Exclusive' | 'Inclusive' | 'NoTax';
  line_items: LineItem[];
  currency_code: string;
  sub_total: number;
  total_tax: number;
  total: number;
  remaining_credit: number;
  reference?: string;
}

export interface Payment {
  payment_id: string;
  invoice?: { invoice_id: string };
  credit_note?: { credit_note_id: string };
  account: { account_id: string };
  date: string;
  amount: number;
  currency_code: string;
  reference?: string;
  status: 'AUTHORISED' | 'DELETED';
}

export interface BankTransaction {
  bank_transaction_id: string;
  type: 'RECEIVE' | 'SPEND' | 'RECEIVE-OVERPAYMENT' | 'RECEIVE-PREPAYMENT' | 'SPEND-OVERPAYMENT' | 'SPEND-PREPAYMENT';
  contact?: { contact_id: string };
  bank_account: { account_id: string };
  date: string;
  status: 'DRAFT' | 'AUTHORISED' | 'DELETED';
  line_amount_types: 'Exclusive' | 'Inclusive' | 'NoTax';
  line_items: LineItem[];
  currency_code: string;
  sub_total: number;
  total_tax: number;
  total: number;
  reference?: string;
  is_reconciled: boolean;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationDiff {
  field: string;
  issue: string;
  expected?: string;
  received?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  diff: ValidationDiff[];
}

// ============================================================================
// Filter Types
// ============================================================================

export interface InvoiceFilter {
  status?: Invoice['status'];
  contact_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface ContactFilter {
  is_customer?: boolean;
  is_supplier?: boolean;
  status?: Contact['status'];
}

export interface AccountFilter {
  type?: Account['type'];
  status?: Account['status'];
}

export interface QuoteFilter {
  status?: Quote['status'];
  contact_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface CreditNoteFilter {
  type?: CreditNote['type'];
  status?: CreditNote['status'];
  contact_id?: string;
}

export interface PaymentFilter {
  invoice_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface BankTransactionFilter {
  type?: BankTransaction['type'];
  status?: BankTransaction['status'];
  bank_account_id?: string;
  is_reconciled?: boolean;
}

// ============================================================================
// Tenant Context
// ============================================================================

export interface TenantContext {
  tenant_id: string;
  tenant_name: string;
  region: string;
  currency: string;
  accounts: Account[];
  tax_rates: TaxRate[];
  contacts: Contact[];
}

// ============================================================================
// Adapter Interface
// ============================================================================

export interface XeroAdapter {
  /**
   * Get the current mode (mock or live)
   */
  getMode(): 'mock' | 'live';

  /**
   * Load tenant context (Chart of Accounts, Tax Rates, etc.)
   */
  getTenantContext(tenantId: string): Promise<TenantContext>;

  /**
   * Get list of available tenants
   */
  getTenants(): Promise<Array<{ tenant_id: string; tenant_name: string; region: string }>>;

  /**
   * Get accounts (Chart of Accounts)
   */
  getAccounts(tenantId: string, filter?: AccountFilter): Promise<Account[]>;

  /**
   * Get tax rates
   */
  getTaxRates(tenantId: string): Promise<TaxRate[]>;

  /**
   * Get contacts
   */
  getContacts(tenantId: string, filter?: ContactFilter): Promise<Contact[]>;

  /**
   * Get invoices
   */
  getInvoices(tenantId: string, filter?: InvoiceFilter): Promise<Invoice[]>;

  /**
   * Validate an invoice payload against the tenant's configuration
   */
  validateInvoice(tenantId: string, invoice: Partial<Invoice>): Promise<ValidationResult>;

  /**
   * Validate a contact payload
   */
  validateContact(tenantId: string, contact: Partial<Contact>): Promise<ValidationResult>;

  /**
   * Get quotes
   */
  getQuotes(tenantId: string, filter?: QuoteFilter): Promise<Quote[]>;

  /**
   * Validate a quote payload
   */
  validateQuote(tenantId: string, quote: Partial<Quote>): Promise<ValidationResult>;

  /**
   * Get credit notes
   */
  getCreditNotes(tenantId: string, filter?: CreditNoteFilter): Promise<CreditNote[]>;

  /**
   * Validate a credit note payload
   */
  validateCreditNote(tenantId: string, creditNote: Partial<CreditNote>): Promise<ValidationResult>;

  /**
   * Get payments
   */
  getPayments(tenantId: string, filter?: PaymentFilter): Promise<Payment[]>;

  /**
   * Validate a payment payload
   */
  validatePayment(tenantId: string, payment: Partial<Payment>): Promise<ValidationResult>;

  /**
   * Get bank transactions
   */
  getBankTransactions(tenantId: string, filter?: BankTransactionFilter): Promise<BankTransaction[]>;

  /**
   * Validate a bank transaction payload
   */
  validateBankTransaction(tenantId: string, transaction: Partial<BankTransaction>): Promise<ValidationResult>;

  // ============================================================================
  // Create Methods
  // ============================================================================

  /**
   * Create a contact
   */
  createContact(tenantId: string, contact: Partial<Contact>): Promise<Contact>;

  /**
   * Create an invoice
   */
  createInvoice(tenantId: string, invoice: Partial<Invoice>): Promise<Invoice>;

  /**
   * Create a quote
   */
  createQuote(tenantId: string, quote: Partial<Quote>): Promise<Quote>;

  /**
   * Create a credit note
   */
  createCreditNote(tenantId: string, creditNote: Partial<CreditNote>): Promise<CreditNote>;

  /**
   * Create a payment
   */
  createPayment(tenantId: string, payment: Partial<Payment>): Promise<Payment>;

  /**
   * Create a bank transaction
   */
  createBankTransaction(tenantId: string, transaction: Partial<BankTransaction>): Promise<BankTransaction>;

  // ============================================================================
  // Update Methods
  // ============================================================================

  /**
   * Update entity status (for lifecycle transitions)
   */
  updateEntityStatus(
    tenantId: string,
    entityType: 'Invoice' | 'Quote' | 'CreditNote',
    entityId: string,
    newStatus: string
  ): Promise<void>;
}
