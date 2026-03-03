// Import-related TypeScript types

export type ParsedInvoiceData = {
  invoiceNumber: number
  clientName: string
  invoiceDate: string // ISO format YYYY-MM-DD
  dueDate: string
  subtotal: number
  vatRate: 0 | 6 | 25
  vatAmount: number
  total: number
  confidence: number // 0-1 scale
}

export type ClientMatchResult = {
  clientId: string | null
  confidence: number
  suggestions: Array<{
    id: string
    name: string
    similarity: number
  }>
  matchMethod?: 'exact' | 'fuzzy' | 'token' | 'ai' | 'manual'
}

export type ImportResult = {
  success: boolean
  invoiceId?: string
  error?: string
  warnings?: string[]
}

export type ImportProgress = {
  total: number
  completed: number
  failed: number
  current?: string
  status: 'idle' | 'processing' | 'completed' | 'error'
}
