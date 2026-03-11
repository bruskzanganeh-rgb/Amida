import { describe, it, expect } from 'vitest'
import {
  createUserSchema,
  changeTierSchema,
  configSchema,
  createOrgSchema,
  updateOrgSchema,
  orgMemberSchema,
} from '@/lib/schemas/admin'
import { authSetupSchema, validateCodeSchema } from '@/lib/schemas/auth'
import { createClientSchema } from '@/lib/schemas/client'
import { updateExpenseSchema, checkDuplicateSchema, batchCheckDuplicateSchema } from '@/lib/schemas/expense'
import { createGigSchema } from '@/lib/schemas/gig'
import { invoiceLineSchema, createInvoiceSchema } from '@/lib/schemas/invoice'
import { completeOnboardingSchema } from '@/lib/schemas/onboarding'
import { testEmailSchema } from '@/lib/schemas/settings'
import { createCheckoutSchema } from '@/lib/schemas/stripe'
import { translateSchema } from '@/lib/schemas/translate'
import { incrementUsageSchema } from '@/lib/schemas/usage'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

// ---------------------------------------------------------------------------
// admin.ts
// ---------------------------------------------------------------------------
describe('admin schemas', () => {
  // ---- createUserSchema ----
  describe('createUserSchema', () => {
    it('accepts valid invite mode without password', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        mode: 'invite',
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid create mode with password', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        password: 'secret123',
        mode: 'create',
      })
      expect(result.success).toBe(true)
    })

    it('accepts invite mode with optional company_name', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        mode: 'invite',
        company_name: 'Acme Corp',
      })
      expect(result.success).toBe(true)
    })

    it('rejects create mode without password', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        mode: 'create',
      })
      expect(result.success).toBe(false)
    })

    it('rejects create mode with short password', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        password: '12345',
        mode: 'create',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid email', () => {
      const result = createUserSchema.safeParse({
        email: 'not-an-email',
        mode: 'invite',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty email', () => {
      const result = createUserSchema.safeParse({
        email: '',
        mode: 'invite',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing email', () => {
      const result = createUserSchema.safeParse({ mode: 'invite' })
      expect(result.success).toBe(false)
    })

    it('rejects invalid mode enum', () => {
      const result = createUserSchema.safeParse({
        email: 'a@b.com',
        mode: 'delete',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing mode', () => {
      const result = createUserSchema.safeParse({ email: 'a@b.com' })
      expect(result.success).toBe(false)
    })

    it('rejects company_name over 200 chars', () => {
      const result = createUserSchema.safeParse({
        email: 'a@b.com',
        mode: 'invite',
        company_name: 'x'.repeat(201),
      })
      expect(result.success).toBe(false)
    })

    it('allows company_name exactly 200 chars', () => {
      const result = createUserSchema.safeParse({
        email: 'a@b.com',
        mode: 'invite',
        company_name: 'x'.repeat(200),
      })
      expect(result.success).toBe(true)
    })
  })

  // ---- changeTierSchema ----
  describe('changeTierSchema', () => {
    it.each(['free', 'pro', 'team'] as const)('accepts plan=%s', (plan) => {
      expect(changeTierSchema.safeParse({ plan }).success).toBe(true)
    })

    it('rejects invalid plan', () => {
      expect(changeTierSchema.safeParse({ plan: 'enterprise' }).success).toBe(false)
    })

    it('rejects missing plan', () => {
      expect(changeTierSchema.safeParse({}).success).toBe(false)
    })

    it('rejects number as plan', () => {
      expect(changeTierSchema.safeParse({ plan: 1 }).success).toBe(false)
    })
  })

  // ---- configSchema ----
  describe('configSchema', () => {
    it('accepts valid key/value', () => {
      expect(configSchema.safeParse({ key: 'flag', value: 'true' }).success).toBe(true)
    })

    it('rejects empty key', () => {
      expect(configSchema.safeParse({ key: '', value: 'v' }).success).toBe(false)
    })

    it('rejects key over 100 chars', () => {
      expect(configSchema.safeParse({ key: 'k'.repeat(101), value: 'v' }).success).toBe(false)
    })

    it('allows key exactly 100 chars', () => {
      expect(configSchema.safeParse({ key: 'k'.repeat(100), value: 'v' }).success).toBe(true)
    })

    it('rejects value over 10000 chars', () => {
      expect(configSchema.safeParse({ key: 'k', value: 'v'.repeat(10001) }).success).toBe(false)
    })

    it('allows value exactly 10000 chars', () => {
      expect(configSchema.safeParse({ key: 'k', value: 'v'.repeat(10000) }).success).toBe(true)
    })

    it('allows empty value string', () => {
      expect(configSchema.safeParse({ key: 'k', value: '' }).success).toBe(true)
    })

    it('rejects missing key', () => {
      expect(configSchema.safeParse({ value: 'v' }).success).toBe(false)
    })

    it('rejects missing value', () => {
      expect(configSchema.safeParse({ key: 'k' }).success).toBe(false)
    })
  })

  // ---- createOrgSchema ----
  describe('createOrgSchema', () => {
    it('accepts valid org with all fields', () => {
      const result = createOrgSchema.safeParse({
        name: 'Org',
        category: 'Music',
        notes: 'Some notes',
      })
      expect(result.success).toBe(true)
    })

    it('accepts with only required name', () => {
      expect(createOrgSchema.safeParse({ name: 'Org' }).success).toBe(true)
    })

    it('rejects empty name', () => {
      expect(createOrgSchema.safeParse({ name: '' }).success).toBe(false)
    })

    it('rejects missing name', () => {
      expect(createOrgSchema.safeParse({}).success).toBe(false)
    })

    it('rejects name over 200 chars', () => {
      expect(createOrgSchema.safeParse({ name: 'n'.repeat(201) }).success).toBe(false)
    })

    it('rejects category over 100 chars', () => {
      expect(createOrgSchema.safeParse({ name: 'Org', category: 'c'.repeat(101) }).success).toBe(false)
    })

    it('rejects notes over 2000 chars', () => {
      expect(createOrgSchema.safeParse({ name: 'Org', notes: 'n'.repeat(2001) }).success).toBe(false)
    })
  })

  // ---- updateOrgSchema ----
  describe('updateOrgSchema', () => {
    it('accepts empty object (all optional)', () => {
      expect(updateOrgSchema.safeParse({}).success).toBe(true)
    })

    it('accepts partial update with name only', () => {
      expect(updateOrgSchema.safeParse({ name: 'New Name' }).success).toBe(true)
    })

    it('accepts null for category (nullable)', () => {
      expect(updateOrgSchema.safeParse({ category: null }).success).toBe(true)
    })

    it('accepts null for notes (nullable)', () => {
      expect(updateOrgSchema.safeParse({ notes: null }).success).toBe(true)
    })

    it('rejects empty name string (min 1)', () => {
      expect(updateOrgSchema.safeParse({ name: '' }).success).toBe(false)
    })

    it('rejects name over 200 chars', () => {
      expect(updateOrgSchema.safeParse({ name: 'n'.repeat(201) }).success).toBe(false)
    })

    it('rejects category over 100 chars', () => {
      expect(updateOrgSchema.safeParse({ category: 'c'.repeat(101) }).success).toBe(false)
    })

    it('rejects notes over 2000 chars', () => {
      expect(updateOrgSchema.safeParse({ notes: 'n'.repeat(2001) }).success).toBe(false)
    })
  })

  // ---- orgMemberSchema ----
  describe('orgMemberSchema', () => {
    it('accepts valid UUID with role', () => {
      expect(orgMemberSchema.safeParse({ user_id: VALID_UUID, role: 'admin' }).success).toBe(true)
    })

    it('accepts valid UUID without role (optional)', () => {
      expect(orgMemberSchema.safeParse({ user_id: VALID_UUID }).success).toBe(true)
    })

    it.each(['member', 'admin', 'owner'] as const)('accepts role=%s', (role) => {
      expect(orgMemberSchema.safeParse({ user_id: VALID_UUID, role }).success).toBe(true)
    })

    it('rejects invalid role', () => {
      expect(orgMemberSchema.safeParse({ user_id: VALID_UUID, role: 'superadmin' }).success).toBe(false)
    })

    it('rejects invalid UUID', () => {
      expect(orgMemberSchema.safeParse({ user_id: 'not-a-uuid' }).success).toBe(false)
    })

    it('rejects missing user_id', () => {
      expect(orgMemberSchema.safeParse({}).success).toBe(false)
    })

    it('rejects empty string user_id', () => {
      expect(orgMemberSchema.safeParse({ user_id: '' }).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// auth.ts
// ---------------------------------------------------------------------------
describe('auth schemas', () => {
  describe('authSetupSchema', () => {
    it('accepts valid UUID with no optional fields', () => {
      expect(authSetupSchema.safeParse({ user_id: VALID_UUID }).success).toBe(true)
    })

    it('accepts all fields', () => {
      const result = authSetupSchema.safeParse({
        user_id: VALID_UUID,
        company_name: 'Acme',
        invitation_code: 'abc123',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing user_id', () => {
      expect(authSetupSchema.safeParse({}).success).toBe(false)
    })

    it('rejects invalid UUID', () => {
      expect(authSetupSchema.safeParse({ user_id: 'bad' }).success).toBe(false)
    })

    it('rejects non-string user_id', () => {
      expect(authSetupSchema.safeParse({ user_id: 123 }).success).toBe(false)
    })
  })

  describe('validateCodeSchema', () => {
    it('accepts non-empty code', () => {
      expect(validateCodeSchema.safeParse({ code: 'abc' }).success).toBe(true)
    })

    it('rejects empty code', () => {
      expect(validateCodeSchema.safeParse({ code: '' }).success).toBe(false)
    })

    it('rejects missing code', () => {
      expect(validateCodeSchema.safeParse({}).success).toBe(false)
    })

    it('rejects non-string code', () => {
      expect(validateCodeSchema.safeParse({ code: 123 }).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// client.ts
// ---------------------------------------------------------------------------
describe('client schemas', () => {
  describe('createClientSchema', () => {
    it('accepts minimal valid data (name only)', () => {
      expect(createClientSchema.safeParse({ name: 'Client A' }).success).toBe(true)
    })

    it('accepts all optional fields', () => {
      const result = createClientSchema.safeParse({
        name: 'Client A',
        client_code: 'CA001',
        org_number: '556000-0000',
        email: 'client@example.com',
        address: 'Street 1',
        payment_terms: '30',
        reference_person: 'John',
        notes: 'Important client',
        invoice_language: 'sv',
        country_code: 'SE',
        vat_number: 'SE556000000001',
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty name', () => {
      expect(createClientSchema.safeParse({ name: '' }).success).toBe(false)
    })

    it('rejects missing name', () => {
      expect(createClientSchema.safeParse({}).success).toBe(false)
    })

    it('accepts empty string for email (special .or(z.literal("")))', () => {
      expect(createClientSchema.safeParse({ name: 'C', email: '' }).success).toBe(true)
    })

    it('accepts valid email', () => {
      expect(createClientSchema.safeParse({ name: 'C', email: 'a@b.com' }).success).toBe(true)
    })

    it('rejects invalid email that is not empty', () => {
      expect(createClientSchema.safeParse({ name: 'C', email: 'bad-email' }).success).toBe(false)
    })

    it('accepts omitted email (optional)', () => {
      expect(createClientSchema.safeParse({ name: 'C' }).success).toBe(true)
    })

    it('rejects non-string name', () => {
      expect(createClientSchema.safeParse({ name: 42 }).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// expense.ts
// ---------------------------------------------------------------------------
describe('expense schemas', () => {
  describe('updateExpenseSchema', () => {
    it('accepts empty object (all optional)', () => {
      expect(updateExpenseSchema.safeParse({}).success).toBe(true)
    })

    it('accepts full update', () => {
      const result = updateExpenseSchema.safeParse({
        date: '2024-01-15',
        supplier: 'Reeds Co',
        amount: 150.5,
        currency: 'SEK',
        amount_base: 150.5,
        category: 'Supplies',
        notes: 'Extra reeds',
        gig_id: VALID_UUID,
      })
      expect(result.success).toBe(true)
    })

    it('accepts null for notes (nullable)', () => {
      expect(updateExpenseSchema.safeParse({ notes: null }).success).toBe(true)
    })

    it('accepts null for gig_id (nullable)', () => {
      expect(updateExpenseSchema.safeParse({ gig_id: null }).success).toBe(true)
    })

    it('rejects non-number amount', () => {
      expect(updateExpenseSchema.safeParse({ amount: 'abc' }).success).toBe(false)
    })

    it('rejects non-number amount_base', () => {
      expect(updateExpenseSchema.safeParse({ amount_base: true }).success).toBe(false)
    })
  })

  describe('checkDuplicateSchema', () => {
    it('accepts valid data', () => {
      const result = checkDuplicateSchema.safeParse({
        date: '2024-01-15',
        supplier: 'Acme',
        amount: 100,
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty date', () => {
      expect(checkDuplicateSchema.safeParse({ date: '', supplier: 'A', amount: 1 }).success).toBe(false)
    })

    it('rejects empty supplier', () => {
      expect(checkDuplicateSchema.safeParse({ date: '2024-01-01', supplier: '', amount: 1 }).success).toBe(false)
    })

    it('rejects missing amount', () => {
      expect(checkDuplicateSchema.safeParse({ date: '2024-01-01', supplier: 'A' }).success).toBe(false)
    })

    it('rejects string amount', () => {
      expect(checkDuplicateSchema.safeParse({ date: '2024-01-01', supplier: 'A', amount: '100' }).success).toBe(false)
    })

    it('accepts zero amount', () => {
      expect(checkDuplicateSchema.safeParse({ date: '2024-01-01', supplier: 'A', amount: 0 }).success).toBe(true)
    })

    it('accepts negative amount', () => {
      expect(checkDuplicateSchema.safeParse({ date: '2024-01-01', supplier: 'A', amount: -50 }).success).toBe(true)
    })
  })

  describe('batchCheckDuplicateSchema', () => {
    it('accepts array with one expense', () => {
      const result = batchCheckDuplicateSchema.safeParse({
        expenses: [{ date: '2024-01-01', supplier: 'A', amount: 100 }],
      })
      expect(result.success).toBe(true)
    })

    it('accepts array with multiple expenses', () => {
      const result = batchCheckDuplicateSchema.safeParse({
        expenses: [
          { date: '2024-01-01', supplier: 'A', amount: 100 },
          { date: '2024-02-01', supplier: 'B', amount: 200 },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty expenses array (min 1)', () => {
      expect(batchCheckDuplicateSchema.safeParse({ expenses: [] }).success).toBe(false)
    })

    it('rejects missing expenses', () => {
      expect(batchCheckDuplicateSchema.safeParse({}).success).toBe(false)
    })

    it('rejects if any item in array is invalid', () => {
      const result = batchCheckDuplicateSchema.safeParse({
        expenses: [
          { date: '2024-01-01', supplier: 'A', amount: 100 },
          { date: '', supplier: 'B', amount: 200 }, // empty date
        ],
      })
      expect(result.success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// gig.ts
// ---------------------------------------------------------------------------
describe('gig schemas', () => {
  describe('createGigSchema', () => {
    const validGig = {
      gig_type_id: 'type-1',
      currency: 'SEK',
      status: 'pending' as const,
      dates: ['2024-06-01'],
    }

    it('accepts minimal valid gig', () => {
      expect(createGigSchema.safeParse(validGig).success).toBe(true)
    })

    it('accepts gig with all optional fields', () => {
      const result = createGigSchema.safeParse({
        ...validGig,
        client_id: 'client-1',
        position_id: 'pos-1',
        fee: 5000,
        travel_expense: 200,
        venue: 'Konserthuset',
        project_name: 'Spring Concert',
        notes: 'Bring mute',
        invoice_notes: 'PO 123',
        response_deadline: '2024-05-15',
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty gig_type_id', () => {
      expect(createGigSchema.safeParse({ ...validGig, gig_type_id: '' }).success).toBe(false)
    })

    it('rejects missing gig_type_id', () => {
      const rest = { ...validGig }
      delete (rest as Record<string, unknown>).gig_type_id
      expect(createGigSchema.safeParse(rest).success).toBe(false)
    })

    it('rejects empty currency', () => {
      expect(createGigSchema.safeParse({ ...validGig, currency: '' }).success).toBe(false)
    })

    it('rejects missing currency', () => {
      const rest = { ...validGig }
      delete (rest as Record<string, unknown>).currency
      expect(createGigSchema.safeParse(rest).success).toBe(false)
    })

    it('rejects missing status', () => {
      const rest = { ...validGig }
      delete (rest as Record<string, unknown>).status
      expect(createGigSchema.safeParse(rest).success).toBe(false)
    })

    it('rejects invalid status enum', () => {
      expect(createGigSchema.safeParse({ ...validGig, status: 'archived' }).success).toBe(false)
    })

    it.each(['tentative', 'pending', 'accepted', 'declined', 'completed', 'invoiced', 'paid', 'cancelled'] as const)(
      'accepts status=%s',
      (status) => {
        expect(createGigSchema.safeParse({ ...validGig, status }).success).toBe(true)
      },
    )

    it('rejects empty dates array (min 1)', () => {
      expect(createGigSchema.safeParse({ ...validGig, dates: [] }).success).toBe(false)
    })

    it('rejects missing dates', () => {
      const rest = { ...validGig }
      delete (rest as Record<string, unknown>).dates
      expect(createGigSchema.safeParse(rest).success).toBe(false)
    })

    it('accepts multiple dates', () => {
      expect(createGigSchema.safeParse({ ...validGig, dates: ['2024-06-01', '2024-06-02'] }).success).toBe(true)
    })

    it('rejects negative fee', () => {
      expect(createGigSchema.safeParse({ ...validGig, fee: -1 }).success).toBe(false)
    })

    it('accepts zero fee', () => {
      expect(createGigSchema.safeParse({ ...validGig, fee: 0 }).success).toBe(true)
    })

    it('rejects negative travel_expense', () => {
      expect(createGigSchema.safeParse({ ...validGig, travel_expense: -100 }).success).toBe(false)
    })

    it('accepts zero travel_expense', () => {
      expect(createGigSchema.safeParse({ ...validGig, travel_expense: 0 }).success).toBe(true)
    })

    it('rejects non-number fee', () => {
      expect(createGigSchema.safeParse({ ...validGig, fee: '5000' }).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// invoice.ts
// ---------------------------------------------------------------------------
describe('invoice schemas', () => {
  const validLine = {
    description: 'Rehearsal',
    quantity: 1,
    unit_price: 5000,
    vat_rate: 25,
  }

  describe('invoiceLineSchema', () => {
    it('accepts valid line', () => {
      expect(invoiceLineSchema.safeParse(validLine).success).toBe(true)
    })

    it('rejects empty description', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, description: '' }).success).toBe(false)
    })

    it('rejects missing description', () => {
      const rest = { ...validLine }
      delete (rest as Record<string, unknown>).description
      expect(invoiceLineSchema.safeParse(rest).success).toBe(false)
    })

    it('rejects quantity below 0.01', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, quantity: 0 }).success).toBe(false)
      expect(invoiceLineSchema.safeParse({ ...validLine, quantity: 0.009 }).success).toBe(false)
    })

    it('accepts quantity exactly 0.01', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, quantity: 0.01 }).success).toBe(true)
    })

    it('rejects negative unit_price', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, unit_price: -1 }).success).toBe(false)
    })

    it('accepts zero unit_price', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, unit_price: 0 }).success).toBe(true)
    })

    it('rejects negative vat_rate', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, vat_rate: -1 }).success).toBe(false)
    })

    it('rejects vat_rate over 100', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, vat_rate: 101 }).success).toBe(false)
    })

    it('accepts vat_rate 0', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, vat_rate: 0 }).success).toBe(true)
    })

    it('accepts vat_rate 100', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, vat_rate: 100 }).success).toBe(true)
    })

    it('rejects non-number quantity', () => {
      expect(invoiceLineSchema.safeParse({ ...validLine, quantity: '1' }).success).toBe(false)
    })
  })

  describe('createInvoiceSchema', () => {
    const validInvoice = {
      client_id: 'client-1',
      vat_rate: 25,
      payment_terms: 30,
      lines: [validLine],
    }

    it('accepts valid invoice', () => {
      expect(createInvoiceSchema.safeParse(validInvoice).success).toBe(true)
    })

    it('accepts invoice with multiple lines', () => {
      const result = createInvoiceSchema.safeParse({
        ...validInvoice,
        lines: [validLine, { ...validLine, description: 'Concert' }],
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty client_id', () => {
      expect(createInvoiceSchema.safeParse({ ...validInvoice, client_id: '' }).success).toBe(false)
    })

    it('rejects missing client_id', () => {
      const rest = { ...validInvoice }
      delete (rest as Record<string, unknown>).client_id
      expect(createInvoiceSchema.safeParse(rest).success).toBe(false)
    })

    it('rejects negative vat_rate', () => {
      expect(createInvoiceSchema.safeParse({ ...validInvoice, vat_rate: -1 }).success).toBe(false)
    })

    it('rejects vat_rate over 100', () => {
      expect(createInvoiceSchema.safeParse({ ...validInvoice, vat_rate: 101 }).success).toBe(false)
    })

    it('rejects payment_terms below 1', () => {
      expect(createInvoiceSchema.safeParse({ ...validInvoice, payment_terms: 0 }).success).toBe(false)
    })

    it('accepts payment_terms exactly 1', () => {
      expect(createInvoiceSchema.safeParse({ ...validInvoice, payment_terms: 1 }).success).toBe(true)
    })

    it('rejects empty lines array (min 1)', () => {
      expect(createInvoiceSchema.safeParse({ ...validInvoice, lines: [] }).success).toBe(false)
    })

    it('rejects missing lines', () => {
      const rest = { ...validInvoice }
      delete (rest as Record<string, unknown>).lines
      expect(createInvoiceSchema.safeParse(rest).success).toBe(false)
    })

    it('rejects if a line in the array is invalid', () => {
      const result = createInvoiceSchema.safeParse({
        ...validInvoice,
        lines: [{ ...validLine, description: '' }],
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-number payment_terms', () => {
      expect(createInvoiceSchema.safeParse({ ...validInvoice, payment_terms: '30' }).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// onboarding.ts
// ---------------------------------------------------------------------------
describe('onboarding schemas', () => {
  describe('completeOnboardingSchema', () => {
    it('accepts empty company_info object (all fields optional)', () => {
      const result = completeOnboardingSchema.safeParse({ company_info: {} })
      expect(result.success).toBe(true)
    })

    it('accepts full company_info', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {
          company_name: 'Amida AB',
          org_number: '556000-0000',
          address: 'Storgatan 1',
          email: 'info@amida.se',
          phone: '+46701234567',
          bank_account: '1234-5678',
          bankgiro: '123-4567',
          iban: 'SE1234567890',
          bic: 'SWEDSESS',
          base_currency: 'SEK',
          country_code: 'SE',
        },
      })
      expect(result.success).toBe(true)
    })

    it('accepts with instruments_text', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        instruments_text: 'Violin, Viola',
      })
      expect(result.success).toBe(true)
    })

    it('accepts with gig_types array', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        gig_types: [{ name: 'Konsert', name_en: 'Concert', vat_rate: 6, color: '#ff0000' }, { name: 'Rep' }],
      })
      expect(result.success).toBe(true)
    })

    it('accepts with positions array', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        positions: [
          { name: 'Konsertmästare', sort_order: 1 },
          { name: 'Tutti', sort_order: 2 },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing company_info', () => {
      expect(completeOnboardingSchema.safeParse({}).success).toBe(false)
    })

    it('rejects gig_type missing required name', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        gig_types: [{ name_en: 'Concert' }],
      })
      expect(result.success).toBe(false)
    })

    it('rejects position missing required name', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        positions: [{ sort_order: 1 }],
      })
      expect(result.success).toBe(false)
    })

    it('rejects position missing required sort_order', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        positions: [{ name: 'Tutti' }],
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-number sort_order in positions', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        positions: [{ name: 'Tutti', sort_order: 'first' }],
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-number vat_rate in gig_types', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        gig_types: [{ name: 'Konsert', vat_rate: 'six' }],
      })
      expect(result.success).toBe(false)
    })

    it('accepts empty gig_types array', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        gig_types: [],
      })
      expect(result.success).toBe(true)
    })

    it('accepts empty positions array', () => {
      const result = completeOnboardingSchema.safeParse({
        company_info: {},
        positions: [],
      })
      expect(result.success).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// settings.ts
// ---------------------------------------------------------------------------
describe('settings schemas', () => {
  describe('testEmailSchema', () => {
    it('accepts valid to_email', () => {
      expect(testEmailSchema.safeParse({ to_email: 'test@example.com' }).success).toBe(true)
    })

    it('rejects invalid to_email', () => {
      expect(testEmailSchema.safeParse({ to_email: 'not-email' }).success).toBe(false)
    })

    it('rejects empty to_email', () => {
      expect(testEmailSchema.safeParse({ to_email: '' }).success).toBe(false)
    })

    it('rejects missing to_email', () => {
      expect(testEmailSchema.safeParse({}).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// stripe.ts
// ---------------------------------------------------------------------------
describe('stripe schemas', () => {
  describe('createCheckoutSchema', () => {
    it('accepts valid priceId with default plan', () => {
      const result = createCheckoutSchema.safeParse({ priceId: 'price_abc123' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.plan).toBe('pro') // default
      }
    })

    it('accepts explicit plan=pro', () => {
      const result = createCheckoutSchema.safeParse({ priceId: 'price_abc', plan: 'pro' })
      expect(result.success).toBe(true)
    })

    it('accepts explicit plan=team', () => {
      const result = createCheckoutSchema.safeParse({ priceId: 'price_abc', plan: 'team' })
      expect(result.success).toBe(true)
    })

    it('rejects invalid plan', () => {
      expect(createCheckoutSchema.safeParse({ priceId: 'price_abc', plan: 'free' }).success).toBe(false)
    })

    it('rejects empty priceId', () => {
      expect(createCheckoutSchema.safeParse({ priceId: '' }).success).toBe(false)
    })

    it('rejects missing priceId', () => {
      expect(createCheckoutSchema.safeParse({}).success).toBe(false)
    })

    it('rejects non-string priceId', () => {
      expect(createCheckoutSchema.safeParse({ priceId: 123 }).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// translate.ts
// ---------------------------------------------------------------------------
describe('translate schemas', () => {
  describe('translateSchema', () => {
    it('accepts valid text with default targetLang', () => {
      const result = translateSchema.safeParse({ text: 'Hej' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.targetLang).toBe('en') // default
      }
    })

    it('accepts explicit targetLang', () => {
      const result = translateSchema.safeParse({ text: 'Hello', targetLang: 'sv' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.targetLang).toBe('sv')
      }
    })

    it('rejects empty text', () => {
      expect(translateSchema.safeParse({ text: '' }).success).toBe(false)
    })

    it('rejects text over 200 chars', () => {
      expect(translateSchema.safeParse({ text: 'x'.repeat(201) }).success).toBe(false)
    })

    it('accepts text exactly 200 chars', () => {
      expect(translateSchema.safeParse({ text: 'x'.repeat(200) }).success).toBe(true)
    })

    it('rejects missing text', () => {
      expect(translateSchema.safeParse({}).success).toBe(false)
    })

    it('rejects targetLang shorter than 2 chars', () => {
      expect(translateSchema.safeParse({ text: 'Hi', targetLang: 'e' }).success).toBe(false)
    })

    it('rejects targetLang longer than 5 chars', () => {
      expect(translateSchema.safeParse({ text: 'Hi', targetLang: 'eng-us' }).success).toBe(false)
    })

    it('accepts targetLang exactly 2 chars', () => {
      expect(translateSchema.safeParse({ text: 'Hi', targetLang: 'sv' }).success).toBe(true)
    })

    it('accepts targetLang exactly 5 chars', () => {
      expect(translateSchema.safeParse({ text: 'Hi', targetLang: 'pt-BR' }).success).toBe(true)
    })

    it('rejects non-string text', () => {
      expect(translateSchema.safeParse({ text: 42 }).success).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// usage.ts
// ---------------------------------------------------------------------------
describe('usage schemas', () => {
  describe('incrementUsageSchema', () => {
    it.each(['invoice', 'receipt_scan'] as const)('accepts type=%s', (type) => {
      expect(incrementUsageSchema.safeParse({ type }).success).toBe(true)
    })

    it('rejects invalid type', () => {
      expect(incrementUsageSchema.safeParse({ type: 'gig' }).success).toBe(false)
    })

    it('rejects missing type', () => {
      expect(incrementUsageSchema.safeParse({}).success).toBe(false)
    })

    it('rejects empty string type', () => {
      expect(incrementUsageSchema.safeParse({ type: '' }).success).toBe(false)
    })

    it('rejects number type', () => {
      expect(incrementUsageSchema.safeParse({ type: 1 }).success).toBe(false)
    })
  })
})
