import { z } from 'zod'

export const testEmailSchema = z.object({
  to_email: z.string().email(),
})

export type TestEmailData = z.infer<typeof testEmailSchema>
