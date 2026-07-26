import z from 'zod'

export const HealthResSchema = z.object({
  status: z.literal('ok')
})
