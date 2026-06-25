import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'

// 1. Schema phục vụ API tạo bản thảo hợp đồng mới (POST /contracts)
export const CreateContractBodySchema = extendApi(
  z
    .object({
      seriesId: z
        .string({ error: 'seriesId phải là một chuỗi ký tự' })
        .min(1, { message: 'seriesId là bắt buộc không được để trống' }),
      mangakaId: z
        .string({ error: 'mangakaId phải là một chuỗi ký tự' })
        .min(1, { message: 'mangakaId là bắt buộc không được để trống' }),
      boardDecisionId: z
        .string({ error: 'boardDecisionId phải là một chuỗi ký tự' })
        .min(1, { message: 'boardDecisionId liên kết quyết định hội đồng là bắt buộc' }),

      contractType: z.nativeEnum($Enums.ContractType, {
        error: 'contractType phải là một giá trị hợp lệ trong Hệ thống Enum'
      }),

      valuationAmount: z
        .number({ error: 'valuationAmount phải là một số' })
        .min(0, { message: 'valuationAmount không được nhỏ hơn 0' }),
      publisherOwnershipPct: z.number({ error: 'publisherOwnershipPct phải là một số' }).min(0).max(100),
      mangakaOwnershipPct: z.number({ error: 'mangakaOwnershipPct phải là một số' }).min(0).max(100),
      terminationClause: z
        .string({ error: 'terminationClause phải là một chuỗi ký tự' })
        .min(1, { message: 'terminationClause là bắt buộc' }),

      // Ép kiểu (Coerce) chuỗi ISO 8601 String từ HTTP Request thành đối tượng Date của JS
      contractStart: z
        .string()
        .datetime({ message: 'contractStart phải là chuỗi định dạng ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)' })
        .transform((val) => new Date(val)),

      contractEnd: z
        .string()
        .datetime({ message: 'contractEnd phải là chuỗi định dạng ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)' })
        .transform((val) => new Date(val))
    })
    .strict()
    .superRefine(({ contractType, publisherOwnershipPct, mangakaOwnershipPct }, ctx) => {
      // Hợp đồng mua đứt (FULL_BUYOUT) -> Chấp nhận tỷ lệ sở hữu của cả 2 bên bằng 0%
      if (contractType === 'FULL_BUYOUT') return

      // Ràng buộc tổng 100% áp dụng cho các mô hình hợp tác bản quyền thương mại thông thường
      if (publisherOwnershipPct + mangakaOwnershipPct !== 100) {
        ctx.addIssue({
          code: 'custom',
          message: 'Tổng phần trăm sở hữu của Nhà xuất bản và Tác giả bắt buộc phải bằng 100%',
          path: ['mangakaOwnershipPct']
        })
      }
    }),
  { title: 'CreateContractBody', description: 'Cấu trúc dữ liệu đầu vào đầy đủ để khởi tạo hợp đồng nháp' }
)

// 2. Schema phục vụ API Editor cập nhật sửa đổi điều khoản thương lượng (PATCH /contracts/:id)
export const EditorUpdateContractBodySchema = extendApi(
  z
    .object({
      contractType: z.nativeEnum($Enums.ContractType).optional(),
      valuationAmount: z.number().min(0).optional(),
      publisherOwnershipPct: z.number().min(0).max(100).optional(),
      mangakaOwnershipPct: z.number().min(0).max(100).optional(),
      terminationClause: z.string().optional(),
      contractStart: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional(),
      contractEnd: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional(),
      note: z.string().max(500, { message: 'Nội dung ghi chú lịch sử phiên bản không được quá 500 ký tự' }).optional()
    })
    .strict()
    .superRefine(({ contractType, publisherOwnershipPct, mangakaOwnershipPct }, ctx) => {
      if (contractType === 'FULL_BUYOUT') return

      if (publisherOwnershipPct !== undefined || mangakaOwnershipPct !== undefined) {
        const pubPct = publisherOwnershipPct ?? 0
        const manPct = mangakaOwnershipPct ?? 0
        if (pubPct + manPct !== 100) {
          ctx.addIssue({
            code: 'custom',
            message: 'Tổng phần trăm sở hữu sau khi thay đổi cấu trúc phải đạt chính xác 100%',
            path: ['mangakaOwnershipPct']
          })
        }
      }
    }),
  { title: 'EditorUpdateContractBody', description: 'Cấu trúc dữ liệu cho phép cập nhật linh hoạt các điều khoản' }
)

// 3. Schema phục vụ API xác thực chữ ký bảo mật số bằng mã OTP (POST /contracts/:id/sign-...)
export const SignContractWithOtpBodySchema = extendApi(
  z
    .object({
      otpCode: z.string().length(6, { message: 'Mã xác thực OTP bắt buộc phải nhập đúng 6 ký số' })
    })
    .strict(),
  { title: 'SignContractWithOtpBody', description: 'Payload xác thực mã OTP an toàn hệ thống' }
)

// Cung cấp các Types gọn gàng ra bên ngoài
export type CreateContractBodyType = z.infer<typeof CreateContractBodySchema>
export type EditorUpdateContractBodyType = z.infer<typeof EditorUpdateContractBodySchema>
export type SignContractWithOtpBodyType = z.infer<typeof SignContractWithOtpBodySchema>
