import { z } from 'zod'

export const incrementUsageSchema = z.object({
  type: z.enum(['invoice', 'receipt_scan', 'email_send']),
})

export type IncrementUsageData = z.infer<typeof incrementUsageSchema>
