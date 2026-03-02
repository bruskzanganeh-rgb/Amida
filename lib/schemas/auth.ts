import { z } from 'zod'

export const authSetupSchema = z.object({
  user_id: z.string().uuid(),
  company_name: z.string().optional(),
  invitation_code: z.string().optional(),
  invitation_token: z.string().optional(),
})

export const validateCodeSchema = z.object({
  code: z.string().min(1),
})

export type AuthSetupData = z.infer<typeof authSetupSchema>
export type ValidateCodeData = z.infer<typeof validateCodeSchema>
