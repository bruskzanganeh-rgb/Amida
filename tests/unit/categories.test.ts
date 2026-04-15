import { describe, it, expect, vi } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  isExpenseCategory,
  categoryLabel,
  categoryLabelStatic,
  CATEGORY_I18N_KEY,
  type ExpenseCategory,
} from '@/lib/expenses/categories'

// ============================================================
// isExpenseCategory — type guard
// ============================================================

describe('isExpenseCategory', () => {
  it('returns true for all known categories', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(isExpenseCategory(cat)).toBe(true)
    }
  })

  it('returns false for unknown string', () => {
    expect(isExpenseCategory('nonexistent')).toBe(false)
    expect(isExpenseCategory('TRAVEL')).toBe(false) // case-sensitive
    expect(isExpenseCategory('Travel')).toBe(false)
  })

  it('returns false for non-string types', () => {
    expect(isExpenseCategory(null)).toBe(false)
    expect(isExpenseCategory(undefined)).toBe(false)
    expect(isExpenseCategory(42)).toBe(false)
    expect(isExpenseCategory(true)).toBe(false)
    expect(isExpenseCategory({})).toBe(false)
    expect(isExpenseCategory([])).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isExpenseCategory('')).toBe(false)
  })
})

// ============================================================
// categoryLabel — localized label via translator function
// ============================================================

describe('categoryLabel', () => {
  const mockT = vi.fn((key: string) => `translated_${key}`)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty string for null category', () => {
    expect(categoryLabel(null, mockT)).toBe('')
  })

  it('returns empty string for undefined category', () => {
    expect(categoryLabel(undefined, mockT)).toBe('')
  })

  it('returns raw value for unknown category', () => {
    expect(categoryLabel('unknown_cat', mockT)).toBe('unknown_cat')
    expect(mockT).not.toHaveBeenCalled()
  })

  it('calls translator with correct i18n key for known category', () => {
    const result = categoryLabel('travel', mockT)
    expect(mockT).toHaveBeenCalledWith('categoryTravel')
    expect(result).toBe('translated_categoryTravel')
  })

  it('translates all known categories', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      mockT.mockClear()
      const result = categoryLabel(cat, mockT)
      const expectedKey = CATEGORY_I18N_KEY[cat]
      expect(mockT).toHaveBeenCalledWith(expectedKey)
      expect(result).toBe(`translated_${expectedKey}`)
    }
  })

  it('falls back to raw category when translator throws', () => {
    const throwingT = vi.fn(() => {
      throw new Error('Missing translation')
    })
    const result = categoryLabel('food', throwingT)
    expect(result).toBe('food')
  })

  it('returns empty string for empty string category', () => {
    // Empty string is falsy, should return ''
    expect(categoryLabel('', mockT)).toBe('')
  })
})

// ============================================================
// categoryLabelStatic — static label lookup
// ============================================================

describe('categoryLabelStatic', () => {
  it('returns empty string for null', () => {
    expect(categoryLabelStatic(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(categoryLabelStatic(undefined)).toBe('')
  })

  it('returns raw value for unknown category', () => {
    expect(categoryLabelStatic('not_a_category')).toBe('not_a_category')
  })

  it('returns Swedish labels by default', () => {
    expect(categoryLabelStatic('travel')).toBe('Resa')
    expect(categoryLabelStatic('food')).toBe('Mat')
    expect(categoryLabelStatic('hotel')).toBe('Hotell')
    expect(categoryLabelStatic('instrument')).toBe('Instrument')
    expect(categoryLabelStatic('sheet_music')).toBe('Noter')
    expect(categoryLabelStatic('equipment')).toBe('Utrustning')
    expect(categoryLabelStatic('office')).toBe('Kontorsmaterial')
    expect(categoryLabelStatic('phone')).toBe('Telefon')
    expect(categoryLabelStatic('subscription')).toBe('Prenumeration')
    expect(categoryLabelStatic('accounting')).toBe('Redovisning')
    expect(categoryLabelStatic('loan')).toBe('Lån')
    expect(categoryLabelStatic('bank')).toBe('Bank')
    expect(categoryLabelStatic('insurance')).toBe('Försäkring')
    expect(categoryLabelStatic('representation')).toBe('Representation')
    expect(categoryLabelStatic('training')).toBe('Utbildning')
    expect(categoryLabelStatic('interest')).toBe('Ränta')
    expect(categoryLabelStatic('subcontractor')).toBe('Underleverantör')
    expect(categoryLabelStatic('other')).toBe('Övrigt')
  })

  it('returns English labels when locale is en', () => {
    expect(categoryLabelStatic('travel', 'en')).toBe('Travel')
    expect(categoryLabelStatic('food', 'en')).toBe('Food')
    expect(categoryLabelStatic('hotel', 'en')).toBe('Hotel')
    expect(categoryLabelStatic('instrument', 'en')).toBe('Instrument')
    expect(categoryLabelStatic('sheet_music', 'en')).toBe('Sheet music')
    expect(categoryLabelStatic('equipment', 'en')).toBe('Equipment')
    expect(categoryLabelStatic('office', 'en')).toBe('Office supplies')
    expect(categoryLabelStatic('phone', 'en')).toBe('Phone')
    expect(categoryLabelStatic('subscription', 'en')).toBe('Subscription')
    expect(categoryLabelStatic('accounting', 'en')).toBe('Accounting')
    expect(categoryLabelStatic('loan', 'en')).toBe('Loan')
    expect(categoryLabelStatic('bank', 'en')).toBe('Bank')
    expect(categoryLabelStatic('insurance', 'en')).toBe('Insurance')
    expect(categoryLabelStatic('representation', 'en')).toBe('Entertainment')
    expect(categoryLabelStatic('training', 'en')).toBe('Training')
    expect(categoryLabelStatic('interest', 'en')).toBe('Interest')
    expect(categoryLabelStatic('subcontractor', 'en')).toBe('Subcontractor')
    expect(categoryLabelStatic('other', 'en')).toBe('Other')
  })

  it('returns Swedish labels when locale explicitly sv', () => {
    expect(categoryLabelStatic('travel', 'sv')).toBe('Resa')
    expect(categoryLabelStatic('other', 'sv')).toBe('Övrigt')
  })

  it('returns empty string for empty string category', () => {
    expect(categoryLabelStatic('')).toBe('')
  })
})

// ============================================================
// EXPENSE_CATEGORIES constant
// ============================================================

describe('EXPENSE_CATEGORIES', () => {
  it('has 18 categories', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(18)
  })

  it('contains expected categories', () => {
    const expected: ExpenseCategory[] = [
      'travel',
      'food',
      'hotel',
      'instrument',
      'sheet_music',
      'equipment',
      'office',
      'phone',
      'subscription',
      'accounting',
      'loan',
      'bank',
      'insurance',
      'representation',
      'training',
      'interest',
      'subcontractor',
      'other',
    ]
    expect([...EXPENSE_CATEGORIES]).toEqual(expected)
  })

  it('all categories have i18n keys', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(CATEGORY_I18N_KEY[cat]).toBeDefined()
      expect(typeof CATEGORY_I18N_KEY[cat]).toBe('string')
      expect(CATEGORY_I18N_KEY[cat].length).toBeGreaterThan(0)
    }
  })
})
