import { z } from 'zod'

export const createCheckoutSchema = z.object({
  priceId: z.string().min(1),
  plan: z.enum(['pro', 'team']).optional().default('pro'),
  trial: z.boolean().optional(),
})

export type CreateCheckoutData = z.infer<typeof createCheckoutSchema>
