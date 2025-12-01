import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { XeroAdapter, Invoice, Contact } from '../../adapters/adapter-interface.js';
import { createResponse, type MCPResponse, type VerbosityLevel } from '../../core/mcp-response.js';

export const SeedSandboxSchema = z.object({
  tenant_id: z.string().describe('Target tenant ID'),
  entity: z.enum(['CONTACTS', 'INVOICES']).describe('Type of entity to generate'),
  count: z.number().min(1).max(50).default(10).describe('Number of entities to generate (max 50)'),
  scenario: z.enum(['DEFAULT', 'OVERDUE_BILLS', 'MIXED_STATUS', 'HIGH_VALUE']).default('DEFAULT')
    .describe('Scenario template for data generation'),
  verbosity: z.enum(['silent', 'compact', 'diagnostic', 'debug']).default('diagnostic'),
});

export type SeedSandboxArgs = z.infer<typeof SeedSandboxSchema>;

export const SEED_SANDBOX_TOOL = {
  name: 'seed_sandbox_data',
  description: `Generates realistic test data for the sandbox.

Use this when you need specific test scenarios:
- DEFAULT: Standard mix of data
- OVERDUE_BILLS: Invoices 30-90 days past due
- MIXED_STATUS: Mix of DRAFT, AUTHORISED, and PAID invoices
- HIGH_VALUE: Invoices with large amounts for stress testing

The generated data is returned directly (not persisted) so you can:
- Use it immediately in subsequent tool calls
- Modify it before creating actual records
- Test validation with realistic data

Returns sample entities you can use in subsequent tool calls.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tenant_id: {
        type: 'string',
        description: 'Target tenant ID',
      },
      entity: {
        type: 'string',
        enum: ['CONTACTS', 'INVOICES'],
        description: 'Type of entity to generate',
      },
      count: {
        type: 'number',
        description: 'Number of entities to generate (max 50)',
        default: 10,
        minimum: 1,
        maximum: 50,
      },
      scenario: {
        type: 'string',
        enum: ['DEFAULT', 'OVERDUE_BILLS', 'MIXED_STATUS', 'HIGH_VALUE'],
        default: 'DEFAULT',
        description: 'Scenario template for data generation',
      },
      verbosity: {
        type: 'string',
        enum: ['silent', 'compact', 'diagnostic', 'debug'],
        default: 'diagnostic',
      },
    },
    required: ['tenant_id', 'entity'],
  },
};

// Simple pseudo-random generator for deterministic test data
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Company name parts for generating realistic names
const companyPrefixes = ['Acme', 'Global', 'Pacific', 'Southern', 'Northern', 'Eastern', 'Western', 'Metro', 'Premier', 'Elite'];
const companyTypes = ['Solutions', 'Services', 'Industries', 'Group', 'Partners', 'Holdings', 'Enterprises', 'Technologies', 'Consulting', 'Trading'];
const companySuffixes = ['Pty Ltd', 'Ltd', 'Inc', 'Corp', 'Co'];

const firstNames = ['James', 'Emma', 'Michael', 'Sarah', 'David', 'Jennifer', 'Robert', 'Lisa', 'William', 'Jessica'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor'];

const productDescriptions = [
  'Consulting Services - Monthly Retainer',
  'Software Development',
  'Project Management',
  'Technical Support',
  'Training Services',
  'Website Maintenance',
  'Marketing Services',
  'Design Services',
  'Data Analysis',
  'System Integration',
];

interface SeedData {
  entity_type: string;
  count: number;
  scenario: string;
  generated: Array<Partial<Invoice> | Partial<Contact>>;
  sample_ids: string[];
}

export async function handleSeedSandbox(
  args: SeedSandboxArgs,
  adapter: XeroAdapter
): Promise<MCPResponse<SeedData>> {
  const startTime = Date.now();
  const { tenant_id, entity, count, scenario, verbosity } = args;

  // Get tenant context for valid account codes and contacts
  const context = await adapter.getTenantContext(tenant_id);
  const activeAccounts = context.accounts.filter(a => a.status === 'ACTIVE' && a.type === 'REVENUE');
  const activeTaxRates = context.tax_rates.filter(t => t.status === 'ACTIVE');
  const activeContacts = context.contacts.filter(c => c.status === 'ACTIVE');

  const random = seededRandom(Date.now());
  const generated: Array<Partial<Invoice> | Partial<Contact>> = [];
  const sampleIds: string[] = [];

  if (entity === 'CONTACTS') {
    for (let i = 0; i < count; i++) {
      const contactId = `gen-contact-${randomUUID().slice(0, 8)}`;
      const firstName = firstNames[Math.floor(random() * firstNames.length)];
      const lastName = lastNames[Math.floor(random() * lastNames.length)];
      const companyName = `${companyPrefixes[Math.floor(random() * companyPrefixes.length)]} ${companyTypes[Math.floor(random() * companyTypes.length)]} ${companySuffixes[Math.floor(random() * companySuffixes.length)]}`;

      const contact: Partial<Contact> = {
        contact_id: contactId,
        name: companyName,
        first_name: firstName,
        last_name: lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${companyName.toLowerCase().replace(/\s+/g, '').slice(0, 10)}.com.au`,
        is_customer: random() > 0.3,
        is_supplier: random() > 0.7,
        status: 'ACTIVE',
      };

      generated.push(contact);
      sampleIds.push(contactId);
    }
  } else if (entity === 'INVOICES') {
    for (let i = 0; i < count; i++) {
      const invoiceId = `gen-invoice-${randomUUID().slice(0, 8)}`;
      const contact = activeContacts[Math.floor(random() * activeContacts.length)];
      const account = activeAccounts[Math.floor(random() * activeAccounts.length)];
      const taxRate = activeTaxRates[Math.floor(random() * activeTaxRates.length)];

      // Generate dates based on scenario
      const today = new Date();
      let invoiceDate: Date;
      let dueDate: Date;
      let status: string;

      switch (scenario) {
        case 'OVERDUE_BILLS':
          invoiceDate = new Date(today.getTime() - (30 + Math.floor(random() * 60)) * 24 * 60 * 60 * 1000);
          dueDate = new Date(invoiceDate.getTime() + 14 * 24 * 60 * 60 * 1000);
          status = 'AUTHORISED';
          break;
        case 'MIXED_STATUS':
          invoiceDate = new Date(today.getTime() - Math.floor(random() * 30) * 24 * 60 * 60 * 1000);
          dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          status = ['DRAFT', 'AUTHORISED', 'PAID'][Math.floor(random() * 3)];
          break;
        case 'HIGH_VALUE':
          invoiceDate = new Date(today.getTime() - Math.floor(random() * 7) * 24 * 60 * 60 * 1000);
          dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          status = 'DRAFT';
          break;
        default: // DEFAULT
          invoiceDate = new Date(today.getTime() - Math.floor(random() * 14) * 24 * 60 * 60 * 1000);
          dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          status = random() > 0.5 ? 'DRAFT' : 'AUTHORISED';
      }

      // Generate line items
      const numLineItems = 1 + Math.floor(random() * 3);
      const lineItems = [];
      for (let j = 0; j < numLineItems; j++) {
        const description = productDescriptions[Math.floor(random() * productDescriptions.length)];
        let quantity: number;
        let unitAmount: number;

        if (scenario === 'HIGH_VALUE') {
          quantity = 10 + Math.floor(random() * 50);
          unitAmount = 500 + Math.floor(random() * 2000);
        } else {
          quantity = 1 + Math.floor(random() * 10);
          unitAmount = 50 + Math.floor(random() * 450);
        }

        lineItems.push({
          description,
          quantity,
          unit_amount: unitAmount,
          account_code: account?.code ?? '200',
          tax_type: taxRate?.tax_type ?? 'OUTPUT',
        });
      }

      const invoice: Partial<Invoice> = {
        invoice_id: invoiceId,
        type: 'ACCREC',
        contact: { contact_id: contact?.contact_id ?? 'contact-001' },
        date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        status: status as 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED',
        line_amount_types: 'Exclusive',
        line_items: lineItems,
        currency_code: context.currency,
      };

      generated.push(invoice);
      sampleIds.push(invoiceId);
    }
  }

  const executionTimeMs = Date.now() - startTime;

  const data: SeedData = {
    entity_type: entity,
    count: generated.length,
    scenario,
    generated: verbosity === 'debug' ? generated : generated.slice(0, 3),
    sample_ids: sampleIds.slice(0, 5),
  };

  let totalAmount = 0;
  if (entity === 'INVOICES') {
    totalAmount = generated.reduce((sum, inv) => {
      const invoice = inv as Partial<Invoice>;
      return sum + (invoice.line_items?.reduce((lineSum, item) => lineSum + item.quantity * item.unit_amount, 0) ?? 0);
    }, 0);
  }

  const narrative = entity === 'INVOICES'
    ? `Generated ${count} sample invoice(s) with scenario '${scenario}'. ` +
      `Total estimated value: $${totalAmount.toFixed(2)}. ` +
      `Use these payloads with validate_schema_match or dry_run_sync.`
    : `Generated ${count} sample contact(s). ` +
      `Use these payloads with validate_schema_match before creating.`;

  return createResponse({
    success: true,
    data,
    verbosity: verbosity as VerbosityLevel,
    executionTimeMs,
    narrative,
  });
}
