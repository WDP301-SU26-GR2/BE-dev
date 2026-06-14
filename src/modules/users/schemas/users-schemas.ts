import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'

export const GetUserByIdParamsSchema = extendApi(
  z.object({
    id: z.string()
  }),
  { title: 'GetUserByIdParams', description: 'Path params for getting user by id' }
)

export const UpdateProfileBodySchema = extendApi(
  z
    .object({
      name: z.string().min(1).max(100).optional(),
      displayName: z.string().min(2).max(100).optional(),
      phoneNumber: z.string().min(10).max(15).optional()
    })
    .strict(),
  { title: 'UpdateProfileBody', description: 'Request body for updating profile' }
)

export type GetUserByIdParamsType = z.infer<typeof GetUserByIdParamsSchema>
export type UpdateProfileBodyType = z.infer<typeof UpdateProfileBodySchema>
