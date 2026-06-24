import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { ContractSchema } from './contract.model'

// 1. Schema tạo bản thảo hợp đồng mới
export const CreateContractBodySchema = extendApi(
  ContractSchema.pick({
    seriesId: true,
    mangakaId: true,
    contractType: true,
    valuationAmount: true,
    publisherOwnershipPct: true,
    mangakaOwnershipPct: true,
    terminationClause: true
  })
    .extend({
      contractStart: z.string().datetime().optional(),
      contractEnd: z.string().datetime().optional()
    })
    .strict()
    .superRefine(({ publisherOwnershipPct, mangakaOwnershipPct }, ctx) => {
      const pubPct = publisherOwnershipPct ?? 0
      const manPct = mangakaOwnershipPct ?? 0
      if (pubPct + manPct !== 100) {
        ctx.addIssue({
          code: 'custom',
          message: 'Total ownership percentage (Publisher + Mangaka) must equal 100%',
          path: ['mangakaOwnershipPct']
        })
      }
    }),
  { title: 'CreateContractBody' }
)

// 2. Schema dành cho Editor chỉnh sửa điều khoản
export const EditorUpdateContractBodySchema = extendApi(
  ContractSchema.pick({
    valuationAmount: true,
    publisherOwnershipPct: true,
    mangakaOwnershipPct: true,
    terminationClause: true
  })
    .extend({
      note: z.string().max(500).optional()
    })
    .partial()
    .strict(),
  { title: 'EditorUpdateContractBody' }
)

// 3. Schema xác thực mã ký kết bằng OTP
export const SignContractWithOtpBodySchema = extendApi(
  z
    .object({
      code: z.string().length(6)
    })
    .strict(),
  { title: 'SignContractWithOtpBody' }
)

export type CreateContractBodyType = z.infer<typeof CreateContractBodySchema>
export type EditorUpdateContractBodyType = z.infer<typeof EditorUpdateContractBodySchema>
export type SignContractWithOtpBodyType = z.infer<typeof SignContractWithOtpBodySchema>
