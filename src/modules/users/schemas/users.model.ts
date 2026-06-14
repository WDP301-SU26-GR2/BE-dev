import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'

export const UserProfileSchema = extendApi(
  z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    displayName: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    status: z.string()
  }),
  { title: 'UserProfile', description: 'Public user profile' }
)

export type UserProfileType = z.infer<typeof UserProfileSchema>
