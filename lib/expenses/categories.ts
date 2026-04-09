/**
 * Single source of truth for expense categories.
 *
 * Values stored in the database are English canonical keys (snake_case).
 * Display labels are translated via next-intl using the keys in CATEGORY_I18N_KEY.
 */

export const EXPENSE_CATEGORIES = [
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
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** Translation key for each category (used with `useTranslations('expense')`) */
export const CATEGORY_I18N_KEY: Record<ExpenseCategory, string> = {
  travel: 'categoryTravel',
  food: 'categoryFood',
  hotel: 'categoryHotel',
  instrument: 'categoryInstrument',
  sheet_music: 'categorySheetMusic',
  equipment: 'categoryEquipment',
  office: 'categoryOffice',
  phone: 'categoryPhone',
  subscription: 'categorySubscription',
  accounting: 'categoryAccounting',
  loan: 'categoryLoan',
  bank: 'categoryBank',
  insurance: 'categoryInsurance',
  representation: 'categoryRepresentation',
  training: 'categoryTraining',
  interest: 'categoryInterest',
  subcontractor: 'categorySubcontractor',
  other: 'categoryOther',
}

/** Type guard — is this string a known canonical category? */
export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(value)
}

/**
 * Get the localized display label for a category key.
 * Falls back to the raw value if not recognized (for legacy/bad data).
 */
export function categoryLabel(category: string | null | undefined, t: (key: string) => string): string {
  if (!category) return ''
  if (!isExpenseCategory(category)) return category
  try {
    return t(CATEGORY_I18N_KEY[category])
  } catch {
    return category
  }
}

/**
 * Static labels for server-side use (e.g. CSV/PDF exports where next-intl
 * isn't available). Keep in sync with messages/{sv,en}.json expense.category*.
 */
const STATIC_CATEGORY_LABELS: Record<'sv' | 'en', Record<ExpenseCategory, string>> = {
  sv: {
    travel: 'Resa',
    food: 'Mat',
    hotel: 'Hotell',
    instrument: 'Instrument',
    sheet_music: 'Noter',
    equipment: 'Utrustning',
    office: 'Kontorsmaterial',
    phone: 'Telefon',
    subscription: 'Prenumeration',
    accounting: 'Redovisning',
    loan: 'Lån',
    bank: 'Bank',
    insurance: 'Försäkring',
    representation: 'Representation',
    training: 'Utbildning',
    interest: 'Ränta',
    subcontractor: 'Underleverantör',
    other: 'Övrigt',
  },
  en: {
    travel: 'Travel',
    food: 'Food',
    hotel: 'Hotel',
    instrument: 'Instrument',
    sheet_music: 'Sheet music',
    equipment: 'Equipment',
    office: 'Office supplies',
    phone: 'Phone',
    subscription: 'Subscription',
    accounting: 'Accounting',
    loan: 'Loan',
    bank: 'Bank',
    insurance: 'Insurance',
    representation: 'Entertainment',
    training: 'Training',
    interest: 'Interest',
    subcontractor: 'Subcontractor',
    other: 'Other',
  },
}

/**
 * Server-side (locale-only) category label lookup. Used for exports
 * and other places where next-intl translations aren't available.
 */
export function categoryLabelStatic(category: string | null | undefined, locale: 'sv' | 'en' = 'sv'): string {
  if (!category) return ''
  if (!isExpenseCategory(category)) return category
  return STATIC_CATEGORY_LABELS[locale][category]
}
