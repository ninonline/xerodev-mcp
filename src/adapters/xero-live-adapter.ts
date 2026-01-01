/**
 * Xero Live Adapter
 * Implements the XeroAdapter interface using the xero-node SDK
 * for real Xero API calls.
 */

import { XeroClient } from 'xero-node';
import type {
  XeroAdapter,
  Contact,
  Account,
  TaxRate,
  Invoice,
  Quote,
  CreditNote,
  Payment,
  BankTransaction,
  TenantContext,
  ValidationResult,
  ContactFilter,
  AccountFilter,
  InvoiceFilter,
  QuoteFilter,
  CreditNoteFilter,
  PaymentFilter,
  BankTransactionFilter,
} from './adapter-interface.js';
import { getDatabase, type TenantRow, createStatements } from '../core/db/index.js';
import { getSecurityGuard } from '../core/security.js';

// ============================================================================
// Configuration
// ============================================================================

interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tenantId: string;
}

/**
 * Connection info returned from database
 */
export interface ConnectionInfo {
  tenant_id: string;
  tenant_name: string | null;
  connection_status: 'active' | 'expired' | 'revoked';
  xero_region: string | null;
  granted_scopes: string;
  created_at: number;
  last_synced_at: number | null;
}

// ============================================================================
// Type Mappers
// ============================================================================

/**
 * Maps Xero SDK Contact to our Contact interface
 */
function mapContact(xeroContact: any): Contact {
  return {
    contact_id: xeroContact.contactID || '',
    name: xeroContact.name || '',
    email: xeroContact.emailAddress,
    first_name: xeroContact.firstName,
    last_name: xeroContact.lastName,
    is_customer: xeroContact.isCustomer || false,
    is_supplier: xeroContact.isSupplier || false,
    status: xeroContact.contactStatus === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    addresses: xeroContact.addresses?.map((addr: any) => ({
      type: addr.addressType === 'POBOX' ? 'POBOX' : 'STREET',
      line1: addr.addressLine1,
      line2: addr.addressLine2,
      city: addr.city,
      region: addr.region,
      postal_code: addr.postalCode,
      country: addr.country,
    })),
    phones: xeroContact.phones?.map((phone: any) => ({
      type: phone.phoneType || 'DEFAULT',
      number: phone.phoneNumber || '',
    })),
  };
}

/**
 * Maps Xero SDK Account to our Account interface
 */
function mapAccount(xeroAccount: any): Account {
  return {
    account_id: xeroAccount.accountID || '',
    code: xeroAccount.code || '',
    name: xeroAccount.name || '',
    type: xeroAccount.type || 'EXPENSE',
    tax_type: xeroAccount.taxType,
    description: xeroAccount.description,
    status: xeroAccount.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
  };
}

/**
 * Maps Xero SDK TaxRate to our TaxRate interface
 */
function mapTaxRate(xeroTaxRate: any): TaxRate {
  return {
    name: xeroTaxRate.name || '',
    tax_type: xeroTaxRate.taxType || '',
    rate: xeroTaxRate.effectiveRate || 0,
    status: xeroTaxRate.status === 'DELETED' ? 'DELETED' : 'ACTIVE',
    description: xeroTaxRate.reportTaxType,
  };
}

/**
 * Maps Xero SDK Invoice to our Invoice interface
 */
function mapInvoice(xeroInvoice: any): Invoice {
  return {
    invoice_id: xeroInvoice.invoiceID || '',
    type: xeroInvoice.type === 'ACCPAY' ? 'ACCPAY' : 'ACCREC',
    contact: { contact_id: xeroInvoice.contact?.contactID || '' },
    date: xeroInvoice.date || '',
    due_date: xeroInvoice.dueDate || '',
    status: xeroInvoice.status || 'DRAFT',
    line_amount_types: xeroInvoice.lineAmountTypes || 'Exclusive',
    line_items: (xeroInvoice.lineItems || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 0,
      unit_amount: item.unitAmount || 0,
      account_code: item.accountCode || '',
      tax_type: item.taxType,
    })),
    currency_code: xeroInvoice.currencyCode || 'AUD',
    sub_total: xeroInvoice.subTotal || 0,
    total_tax: xeroInvoice.totalTax || 0,
    total: xeroInvoice.total || 0,
  };
}

/**
 * Maps Xero SDK Quote to our Quote interface
 */
function mapQuote(xeroQuote: any): Quote {
  return {
    quote_id: xeroQuote.quoteID || '',
    quote_number: xeroQuote.quoteNumber || '',
    contact: { contact_id: xeroQuote.contact?.contactID || '' },
    date: xeroQuote.date || '',
    expiry_date: xeroQuote.expiryDate || '',
    status: xeroQuote.status || 'DRAFT',
    line_amount_types: xeroQuote.lineAmountTypes || 'Exclusive',
    line_items: (xeroQuote.lineItems || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 0,
      unit_amount: item.unitAmount || 0,
      account_code: item.accountCode || '',
      tax_type: item.taxType,
    })),
    currency_code: xeroQuote.currencyCode || 'AUD',
    sub_total: xeroQuote.subTotal || 0,
    total_tax: xeroQuote.totalTax || 0,
    total: xeroQuote.total || 0,
    title: xeroQuote.title,
    summary: xeroQuote.summary,
    terms: xeroQuote.terms,
  };
}

/**
 * Maps Xero SDK CreditNote to our CreditNote interface
 */
function mapCreditNote(xeroCreditNote: any): CreditNote {
  return {
    credit_note_id: xeroCreditNote.creditNoteID || '',
    credit_note_number: xeroCreditNote.creditNoteNumber || '',
    type: xeroCreditNote.type === 'ACCPAYCREDIT' ? 'ACCPAYCREDIT' : 'ACCRECCREDIT',
    contact: { contact_id: xeroCreditNote.contact?.contactID || '' },
    date: xeroCreditNote.date || '',
    status: xeroCreditNote.status || 'DRAFT',
    line_amount_types: xeroCreditNote.lineAmountTypes || 'Exclusive',
    line_items: (xeroCreditNote.lineItems || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 0,
      unit_amount: item.unitAmount || 0,
      account_code: item.accountCode || '',
      tax_type: item.taxType,
    })),
    currency_code: xeroCreditNote.currencyCode || 'AUD',
    sub_total: xeroCreditNote.subTotal || 0,
    total_tax: xeroCreditNote.totalTax || 0,
    total: xeroCreditNote.total || 0,
    remaining_credit: xeroCreditNote.remainingCredit || 0,
    reference: xeroCreditNote.reference,
  };
}

/**
 * Maps Xero SDK Payment to our Payment interface
 */
function mapPayment(xeroPayment: any): Payment {
  return {
    payment_id: xeroPayment.paymentID || '',
    invoice: xeroPayment.invoice ? { invoice_id: xeroPayment.invoice.invoiceID } : undefined,
    credit_note: xeroPayment.creditNote ? { credit_note_id: xeroPayment.creditNote.creditNoteID } : undefined,
    account: { account_id: xeroPayment.account?.accountID || '' },
    date: xeroPayment.date || '',
    amount: xeroPayment.amount || 0,
    currency_code: xeroPayment.currencyCode || 'AUD',
    reference: xeroPayment.reference,
    status: xeroPayment.status === 'DELETED' ? 'DELETED' : 'AUTHORISED',
  };
}

/**
 * Maps Xero SDK BankTransaction to our BankTransaction interface
 */
function mapBankTransaction(xeroBankTxn: any): BankTransaction {
  return {
    bank_transaction_id: xeroBankTxn.bankTransactionID || '',
    type: xeroBankTxn.type || 'RECEIVE',
    contact: xeroBankTxn.contact ? { contact_id: xeroBankTxn.contact.contactID } : undefined,
    bank_account: { account_id: xeroBankTxn.bankAccount?.accountID || '' },
    date: xeroBankTxn.date || '',
    status: xeroBankTxn.status || 'DRAFT',
    line_amount_types: xeroBankTxn.lineAmountTypes || 'Exclusive',
    line_items: (xeroBankTxn.lineItems || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 0,
      unit_amount: item.unitAmount || 0,
      account_code: item.accountCode || '',
      tax_type: item.taxType,
    })),
    currency_code: xeroBankTxn.currencyCode || 'AUD',
    sub_total: xeroBankTxn.subTotal || 0,
    total_tax: xeroBankTxn.totalTax || 0,
    total: xeroBankTxn.total || 0,
    reference: xeroBankTxn.reference,
    is_reconciled: xeroBankTxn.isReconciled || false,
  };
}

// ============================================================================
// XeroLiveAdapter Implementation
// ============================================================================

export class XeroLiveAdapter implements XeroAdapter {
  private xero: XeroClient;
  private config: XeroConfig;
  private tokenStore: Map<string, StoredTokens> = new Map();
  private tenantCache: Map<string, TenantContext> = new Map();
  private security = getSecurityGuard();
  private db;
  private statements: ReturnType<typeof createStatements>;

  constructor() {
    // Load configuration from environment
    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const redirectUri = process.env.XERO_REDIRECT_URI || 'http://localhost:3000/callback';

    if (!clientId || !clientSecret) {
      throw new Error(
        'XERO_CLIENT_ID and XERO_CLIENT_SECRET environment variables are required for live mode.\n' +
        'Register your app at https://developer.xero.com/myapps'
      );
    }

    this.config = { clientId, clientSecret, redirectUri };

    this.xero = new XeroClient({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUris: [this.config.redirectUri],
      scopes: [
        'openid',
        'profile',
        'email',
        'accounting.transactions',
        'accounting.contacts',
        'accounting.settings',
      ],
    });

    // Initialize database
    this.db = getDatabase();
    this.statements = createStatements(this.db);

    // Load stored tokens from database
    this.loadStoredTokens();

    console.error('[XeroLiveAdapter] Initialised with Xero API client and loaded stored connections');
  }

  /**
   * Exposes the XeroClient for OAuth tools
   */
  getXeroClient(): XeroClient {
    return this.xero;
  }

  /**
   * Loads encrypted tokens from database into memory
   */
  private loadStoredTokens(): void {
    try {
      const rows = this.statements.getAllTenantsIncludingInactive.all();
      for (const row of rows) {
        try {
          const decryptedAccess = this.security.decrypt(row.access_token);
          const decryptedRefresh = this.security.decrypt(row.refresh_token);
          this.tokenStore.set(row.tenant_id, {
            accessToken: decryptedAccess,
            refreshToken: decryptedRefresh,
            expiresAt: row.token_expires_at,
            tenantId: row.tenant_id,
          });
        } catch (error) {
          console.error(`[XeroLiveAdapter] Failed to decrypt tokens for tenant '${row.tenant_id}': ${error}`);
        }
      }
      console.error(`[XeroLiveAdapter] Loaded ${this.tokenStore.size} stored connection(s) from database`);
    } catch (error) {
      console.error(`[XeroLiveAdapter] Failed to load tokens from database: ${error}`);
    }
  }

  /**
   * Gets all stored connections from database
   */
  getConnections(): ConnectionInfo[] {
    try {
      const rows = this.statements.getAllTenantsIncludingInactive.all() as TenantRow[];
      return rows.map(row => ({
        tenant_id: row.tenant_id,
        tenant_name: row.tenant_name,
        connection_status: row.connection_status,
        xero_region: row.xero_region,
        granted_scopes: row.granted_scopes,
        created_at: row.created_at,
        last_synced_at: row.last_synced_at,
      }));
    } catch (error) {
      console.error(`[XeroLiveAdapter] Failed to get connections: ${error}`);
      return [];
    }
  }

  /**
   * Stores tokens from OAuth callback to database (encrypted)
   */
  storeTokensFromCallback(
    tenantId: string,
    tenantName: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    scopes: string[],
    region: string
  ): void {
    try {
      const encryptedAccess = this.security.encrypt(accessToken);
      const encryptedRefresh = this.security.encrypt(refreshToken);

      this.statements.insertTenant.run({
        tenant_id: tenantId,
        tenant_name: tenantName,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        token_expires_at: expiresAt,
        granted_scopes: JSON.stringify(scopes),
        xero_region: region,
        connection_status: 'active',
      });

      // Also store in memory
      this.tokenStore.set(tenantId, {
        accessToken,
        refreshToken,
        expiresAt,
        tenantId,
      });

      console.error(`[XeroLiveAdapter] Stored tokens for tenant '${tenantId}' (${tenantName})`);
    } catch (error) {
      throw new Error(`Failed to store tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Refreshes tokens for a tenant and persists to database
   */
  async refreshConnection(tenantId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const stored = this.tokenStore.get(tenantId);
      if (!stored) {
        return { success: false, error: `No tokens found for tenant '${tenantId}'` };
      }

      // Set current tokens on client
      this.xero.setTokenSet({
        access_token: stored.accessToken,
        refresh_token: stored.refreshToken,
        expires_at: stored.expiresAt,
        token_type: 'Bearer',
      });

      // Refresh
      const newTokens = await this.xero.refreshToken();

      const updated: StoredTokens = {
        accessToken: newTokens.access_token!,
        refreshToken: newTokens.refresh_token!,
        expiresAt: newTokens.expires_at!,
        tenantId,
      };

      // Update memory
      this.tokenStore.set(tenantId, updated);

      // Update database
      const encryptedAccess = this.security.encrypt(updated.accessToken);
      const encryptedRefresh = this.security.encrypt(updated.refreshToken);

      this.statements.updateTenantTokens.run({
        tenant_id: tenantId,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        token_expires_at: updated.expiresAt,
      });

      console.error(`[XeroLiveAdapter] Refreshed tokens for tenant '${tenantId}'`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[XeroLiveAdapter] Failed to refresh tokens for '${tenantId}': ${message}`);

      // Mark as expired
      try {
        this.statements.updateTenantStatus.run({
          tenant_id: tenantId,
          connection_status: 'expired',
        });
      } catch {}

      return { success: false, error: message };
    }
  }

  /**
   * Revokes/removes a connection
   */
  revokeConnection(tenantId: string): { success: boolean; error?: string } {
    try {
      this.statements.deleteTenant.run({ tenant_id: tenantId });
      this.tokenStore.delete(tenantId);
      this.tenantCache.delete(tenantId);
      console.error(`[XeroLiveAdapter] Revoked connection for tenant '${tenantId}'`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getMode(): 'mock' | 'live' {
    return 'live';
  }

  /**
   * Ensures we have valid tokens for the tenant
   */
  private async ensureTokens(tenantId: string): Promise<void> {
    const stored = this.tokenStore.get(tenantId);
    if (!stored) {
      throw new Error(
        `No tokens found for tenant '${tenantId}'. ` +
        'Complete OAuth flow first by visiting the authorization URL.'
      );
    }

    // Check if token needs refresh (expires in less than 5 minutes)
    if (Date.now() > stored.expiresAt - 5 * 60 * 1000) {
      await this.refreshTokens(tenantId);
    }

    // Set the token set on the client
    this.xero.setTokenSet({
      access_token: stored.accessToken,
      refresh_token: stored.refreshToken,
      expires_at: stored.expiresAt,
      token_type: 'Bearer',
    });
  }

  /**
   * Refreshes OAuth tokens
   */
  private async refreshTokens(tenantId: string): Promise<void> {
    const stored = this.tokenStore.get(tenantId);
    if (!stored) {
      throw new Error(`No tokens to refresh for tenant '${tenantId}'`);
    }

    try {
      const newTokens = await this.xero.refreshToken();
      this.tokenStore.set(tenantId, {
        accessToken: newTokens.access_token!,
        refreshToken: newTokens.refresh_token!,
        expiresAt: newTokens.expires_at!,
        tenantId,
      });
      console.error(`[XeroLiveAdapter] Refreshed tokens for tenant '${tenantId}'`);
    } catch (error) {
      throw new Error(
        `Failed to refresh tokens for tenant '${tenantId}': ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        'User may need to re-authorise.'
      );
    }
  }

  /**
   * Store tokens after OAuth callback
   */
  storeTokens(tenantId: string, tokens: StoredTokens): void {
    this.tokenStore.set(tenantId, tokens);
  }

  // ============================================================================
  // Read Methods
  // ============================================================================

  async getTenants(): Promise<Array<{ tenant_id: string; tenant_name: string; region: string; currency: string }>> {
    // For live mode, we need to get tenants from the stored connections
    const tenants = await this.xero.updateTenants();
    return tenants.map(t => ({
      tenant_id: t.tenantId!,
      tenant_name: t.tenantName || 'Unknown',
      region: t.tenantType || 'AU',
      currency: (t as any).baseCurrency || 'AUD',
    }));
  }

  async getTenantContext(tenantId: string): Promise<TenantContext> {
    // Check cache first
    const cached = this.tenantCache.get(tenantId);
    if (cached) {
      return cached;
    }

    await this.ensureTokens(tenantId);

    // Fetch accounts, tax rates, and contacts in parallel
    const [accounts, taxRates, contacts] = await Promise.all([
      this.getAccounts(tenantId),
      this.getTaxRates(tenantId),
      this.getContacts(tenantId),
    ]);

    // Get tenant info
    const tenants = await this.getTenants();
    const tenant = tenants.find(t => t.tenant_id === tenantId);

    const context: TenantContext = {
      tenant_id: tenantId,
      tenant_name: tenant?.tenant_name || 'Unknown',
      region: tenant?.region || 'AU',
      currency: tenant?.currency || 'AUD',
      accounts,
      tax_rates: taxRates,
      contacts,
    };

    this.tenantCache.set(tenantId, context);
    return context;
  }

  async getAccounts(tenantId: string, filter?: AccountFilter): Promise<Account[]> {
    await this.ensureTokens(tenantId);

    const response = await this.xero.accountingApi.getAccounts(tenantId);
    let accounts = (response.body.accounts || []).map(mapAccount);

    // Apply filters
    if (filter?.type) {
      accounts = accounts.filter(a => a.type === filter.type);
    }
    if (filter?.status) {
      accounts = accounts.filter(a => a.status === filter.status);
    }

    return accounts;
  }

  async getTaxRates(tenantId: string): Promise<TaxRate[]> {
    await this.ensureTokens(tenantId);

    const response = await this.xero.accountingApi.getTaxRates(tenantId);
    return (response.body.taxRates || []).map(mapTaxRate);
  }

  async getContacts(tenantId: string, filter?: ContactFilter): Promise<Contact[]> {
    await this.ensureTokens(tenantId);

    const response = await this.xero.accountingApi.getContacts(tenantId);
    let contacts = (response.body.contacts || []).map(mapContact);

    // Apply filters
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
    await this.ensureTokens(tenantId);

    let where: string | undefined;
    const conditions: string[] = [];

    if (filter?.status) {
      conditions.push(`Status=="${filter.status}"`);
    }
    if (filter?.contact_id) {
      conditions.push(`Contact.ContactID==Guid("${filter.contact_id}")`);
    }

    if (conditions.length > 0) {
      where = conditions.join(' AND ');
    }

    const response = await this.xero.accountingApi.getInvoices(
      tenantId,
      undefined, // ifModifiedSince
      where
    );

    let invoices = (response.body.invoices || []).map(mapInvoice);

    // Apply date filters in memory (Xero's where clause is limited)
    if (filter?.from_date) {
      invoices = invoices.filter(i => i.date >= filter.from_date!);
    }
    if (filter?.to_date) {
      invoices = invoices.filter(i => i.date <= filter.to_date!);
    }

    return invoices;
  }

  async getQuotes(tenantId: string, filter?: QuoteFilter): Promise<Quote[]> {
    await this.ensureTokens(tenantId);

    const response = await this.xero.accountingApi.getQuotes(tenantId);
    let quotes = (response.body.quotes || []).map(mapQuote);

    // Apply filters
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

  async getCreditNotes(tenantId: string, filter?: CreditNoteFilter): Promise<CreditNote[]> {
    await this.ensureTokens(tenantId);

    const response = await this.xero.accountingApi.getCreditNotes(tenantId);
    let creditNotes = (response.body.creditNotes || []).map(mapCreditNote);

    // Apply filters
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

  async getPayments(tenantId: string, filter?: PaymentFilter): Promise<Payment[]> {
    await this.ensureTokens(tenantId);

    const response = await this.xero.accountingApi.getPayments(tenantId);
    let payments = (response.body.payments || []).map(mapPayment);

    // Apply filters
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

  async getBankTransactions(tenantId: string, filter?: BankTransactionFilter): Promise<BankTransaction[]> {
    await this.ensureTokens(tenantId);

    const response = await this.xero.accountingApi.getBankTransactions(tenantId);
    let transactions = (response.body.bankTransactions || []).map(mapBankTransaction);

    // Apply filters
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

  // ============================================================================
  // Validation Methods
  // ============================================================================

  async validateInvoice(tenantId: string, invoice: Partial<Invoice>): Promise<ValidationResult> {
    const context = await this.getTenantContext(tenantId);
    return this.validateEntity(context, 'Invoice', invoice);
  }

  async validateContact(tenantId: string, contact: Partial<Contact>): Promise<ValidationResult> {
    const context = await this.getTenantContext(tenantId);
    return this.validateEntity(context, 'Contact', contact);
  }

  async validateQuote(tenantId: string, quote: Partial<Quote>): Promise<ValidationResult> {
    const context = await this.getTenantContext(tenantId);
    return this.validateEntity(context, 'Quote', quote);
  }

  async validateCreditNote(tenantId: string, creditNote: Partial<CreditNote>): Promise<ValidationResult> {
    const context = await this.getTenantContext(tenantId);
    return this.validateEntity(context, 'CreditNote', creditNote);
  }

  async validatePayment(tenantId: string, payment: Partial<Payment>): Promise<ValidationResult> {
    const context = await this.getTenantContext(tenantId);
    return this.validateEntity(context, 'Payment', payment);
  }

  async validateBankTransaction(tenantId: string, transaction: Partial<BankTransaction>): Promise<ValidationResult> {
    const context = await this.getTenantContext(tenantId);
    return this.validateEntity(context, 'BankTransaction', transaction);
  }

  /**
   * Common validation logic
   */
  private validateEntity(
    context: TenantContext,
    _entityType: string,
    entity: any
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const diff: Array<{ field: string; issue: string; severity: 'error' | 'warning' | 'info' }> = [];

    // Validate line items for entities that have them
    if (entity.line_items) {
      for (const [i, item] of entity.line_items.entries()) {
        // Check account code
        if (item.account_code) {
          const account = context.accounts.find(a => a.code === item.account_code);
          if (!account) {
            errors.push(`line_items[${i}].account_code '${item.account_code}' not found`);
            diff.push({ field: `line_items[${i}].account_code`, issue: 'Account code not found', severity: 'error' });
          } else if (account.status === 'ARCHIVED') {
            errors.push(`line_items[${i}].account_code '${item.account_code}' is ARCHIVED`);
            diff.push({ field: `line_items[${i}].account_code`, issue: 'Account is archived', severity: 'error' });
          }
        }

        // Check tax type
        if (item.tax_type) {
          const taxRate = context.tax_rates.find(t => t.tax_type === item.tax_type);
          if (!taxRate) {
            errors.push(`line_items[${i}].tax_type '${item.tax_type}' not found`);
            diff.push({ field: `line_items[${i}].tax_type`, issue: 'Tax type not found', severity: 'error' });
          } else if (taxRate.status === 'DELETED') {
            warnings.push(`line_items[${i}].tax_type '${item.tax_type}' is DELETED`);
            diff.push({ field: `line_items[${i}].tax_type`, issue: 'Tax type is deleted', severity: 'warning' });
          }
        }
      }
    }

    // Validate contact
    if (entity.contact?.contact_id) {
      const contact = context.contacts.find(c => c.contact_id === entity.contact.contact_id);
      if (!contact) {
        errors.push(`contact.contact_id '${entity.contact.contact_id}' not found`);
        diff.push({ field: 'contact.contact_id', issue: 'Contact not found', severity: 'error' });
      } else if (contact.status === 'ARCHIVED') {
        warnings.push(`Contact '${contact.name}' is ARCHIVED`);
        diff.push({ field: 'contact.contact_id', issue: 'Contact is archived', severity: 'warning' });
      }
    }

    // Validate bank account for payments and bank transactions
    if (entity.account?.account_id || entity.bank_account?.account_id) {
      const accountId = entity.account?.account_id || entity.bank_account?.account_id;
      const account = context.accounts.find(a => a.account_id === accountId);
      if (!account) {
        errors.push(`Bank account '${accountId}' not found`);
        diff.push({ field: 'account.account_id', issue: 'Bank account not found', severity: 'error' });
      } else if (account.type !== 'BANK') {
        errors.push(`Account '${accountId}' is not a BANK account`);
        diff.push({ field: 'account.account_id', issue: 'Account is not a bank account', severity: 'error' });
      }
    }

    const score = errors.length === 0 ? 1.0 : Math.max(0, 1 - errors.length * 0.2);

    return {
      valid: errors.length === 0,
      score,
      errors,
      warnings,
      diff,
    };
  }

  // ============================================================================
  // Create Methods
  // ============================================================================

  async createContact(tenantId: string, contact: Partial<Contact>): Promise<Contact> {
    await this.ensureTokens(tenantId);

    const xeroContact = {
      name: contact.name,
      emailAddress: contact.email,
      firstName: contact.first_name,
      lastName: contact.last_name,
      isCustomer: contact.is_customer,
      isSupplier: contact.is_supplier,
    };

    const response = await this.xero.accountingApi.createContacts(tenantId, { contacts: [xeroContact] });
    const created = response.body.contacts?.[0];

    if (!created) {
      throw new Error('Failed to create contact: No response from Xero');
    }

    // Invalidate cache
    this.tenantCache.delete(tenantId);

    return mapContact(created);
  }

  async createInvoice(tenantId: string, invoice: Partial<Invoice>): Promise<Invoice> {
    await this.ensureTokens(tenantId);

    const xeroInvoice = {
      type: invoice.type,
      contact: { contactID: invoice.contact?.contact_id },
      date: invoice.date,
      dueDate: invoice.due_date,
      status: invoice.status,
      lineAmountTypes: invoice.line_amount_types,
      lineItems: invoice.line_items?.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unit_amount,
        accountCode: item.account_code,
        taxType: item.tax_type,
      })),
      currencyCode: invoice.currency_code,
    };

    const response = await this.xero.accountingApi.createInvoices(tenantId, { invoices: [xeroInvoice as any] });
    const created = response.body.invoices?.[0];

    if (!created) {
      throw new Error('Failed to create invoice: No response from Xero');
    }

    return mapInvoice(created);
  }

  async createQuote(tenantId: string, quote: Partial<Quote>): Promise<Quote> {
    await this.ensureTokens(tenantId);

    const xeroQuote = {
      contact: { contactID: quote.contact?.contact_id },
      date: quote.date,
      expiryDate: quote.expiry_date,
      status: quote.status,
      lineAmountTypes: quote.line_amount_types,
      lineItems: quote.line_items?.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unit_amount,
        accountCode: item.account_code,
        taxType: item.tax_type,
      })),
      currencyCode: quote.currency_code,
      title: quote.title,
      summary: quote.summary,
      terms: quote.terms,
    };

    const response = await this.xero.accountingApi.createQuotes(tenantId, { quotes: [xeroQuote as any] });
    const created = response.body.quotes?.[0];

    if (!created) {
      throw new Error('Failed to create quote: No response from Xero');
    }

    return mapQuote(created);
  }

  async createCreditNote(tenantId: string, creditNote: Partial<CreditNote>): Promise<CreditNote> {
    await this.ensureTokens(tenantId);

    const xeroCreditNote = {
      type: creditNote.type,
      contact: { contactID: creditNote.contact?.contact_id },
      date: creditNote.date,
      status: creditNote.status,
      lineAmountTypes: creditNote.line_amount_types,
      lineItems: creditNote.line_items?.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unit_amount,
        accountCode: item.account_code,
        taxType: item.tax_type,
      })),
      currencyCode: creditNote.currency_code,
      reference: creditNote.reference,
    };

    const response = await this.xero.accountingApi.createCreditNotes(tenantId, { creditNotes: [xeroCreditNote as any] });
    const created = response.body.creditNotes?.[0];

    if (!created) {
      throw new Error('Failed to create credit note: No response from Xero');
    }

    return mapCreditNote(created);
  }

  async createPayment(tenantId: string, payment: Partial<Payment>): Promise<Payment> {
    await this.ensureTokens(tenantId);

    const xeroPayment: any = {
      account: { accountID: payment.account?.account_id },
      date: payment.date,
      amount: payment.amount,
      reference: payment.reference,
    };

    if (payment.invoice?.invoice_id) {
      xeroPayment.invoice = { invoiceID: payment.invoice.invoice_id };
    }
    if (payment.credit_note?.credit_note_id) {
      xeroPayment.creditNote = { creditNoteID: payment.credit_note.credit_note_id };
    }

    const response = await this.xero.accountingApi.createPayments(tenantId, { payments: [xeroPayment] });
    const created = response.body.payments?.[0];

    if (!created) {
      throw new Error('Failed to create payment: No response from Xero');
    }

    return mapPayment(created);
  }

  async createBankTransaction(tenantId: string, transaction: Partial<BankTransaction>): Promise<BankTransaction> {
    await this.ensureTokens(tenantId);

    const xeroTransaction: any = {
      type: transaction.type,
      bankAccount: { accountID: transaction.bank_account?.account_id },
      date: transaction.date,
      status: transaction.status,
      lineAmountTypes: transaction.line_amount_types,
      lineItems: transaction.line_items?.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unit_amount,
        accountCode: item.account_code,
        taxType: item.tax_type,
      })),
      reference: transaction.reference,
    };

    if (transaction.contact?.contact_id) {
      xeroTransaction.contact = { contactID: transaction.contact.contact_id };
    }

    const response = await this.xero.accountingApi.createBankTransactions(tenantId, { bankTransactions: [xeroTransaction] });
    const created = response.body.bankTransactions?.[0];

    if (!created) {
      throw new Error('Failed to create bank transaction: No response from Xero');
    }

    return mapBankTransaction(created);
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
    await this.ensureTokens(tenantId);

    switch (entityType) {
      case 'Invoice': {
        const invoice = { invoiceID: entityId, status: newStatus } as any;
        await this.xero.accountingApi.updateInvoice(tenantId, entityId, { invoices: [invoice] });
        break;
      }
      case 'Quote': {
        const quote = { quoteID: entityId, status: newStatus } as any;
        await this.xero.accountingApi.updateQuote(tenantId, entityId, { quotes: [quote] });
        break;
      }
      case 'CreditNote': {
        const creditNote = { creditNoteID: entityId, status: newStatus } as any;
        await this.xero.accountingApi.updateCreditNote(tenantId, entityId, { creditNotes: [creditNote] });
        break;
      }
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }
}
