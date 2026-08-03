import { SeriesRequestStatus, SeriesRequestType } from '@prisma/client'
import { z } from 'zod'
import { zEnum, zEnumString } from 'src/core/http/docs/enum-docs'
import { zObjectId } from 'src/core/http/schemas/object-id.schema'

export const CreateSeriesRequestBodySchema = z
  .object({
    seriesId: zObjectId('seriesId phải là ObjectId hợp lệ'),
    requestType: zEnum(SeriesRequestType, 'SeriesRequestType'),
    reason: z
      .string({ error: 'reason phải là chuỗi ký tự' })
      .trim()
      .min(1, { message: 'Vui lòng nhập lý do' })
      .max(1000, { message: 'Lý do không được quá 1000 ký tự' }),
    expectedReturnDate: z
      .string()
      .datetime({ message: 'expectedReturnDate phải là chuỗi ISO 8601' })
      .optional()
      .describe('Chỉ dùng cho HIATUS — ngày dự kiến quay lại'),
    proposedEndingChapters: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .describe('Chỉ dùng cho COMPLETION — số chương đề nghị để kết truyện')
  })
  .strict()

export const AcceptSeriesRequestBodySchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
    expectedReturnDate: z
      .string()
      .datetime({ message: 'expectedReturnDate phải là chuỗi ISO 8601' })
      .optional()
      .describe('Biên tập viên ghi đè ngày quay lại (chỉ HIATUS); bỏ trống = giữ ngày tác giả xin')
  })
  .strict()

export const RejectSeriesRequestBodySchema = z
  .object({
    reason: z
      .string({ error: 'reason phải là chuỗi ký tự' })
      .trim()
      .min(1, { message: 'Vui lòng nhập lý do từ chối' })
      .max(1000, { message: 'Lý do không được quá 1000 ký tự' })
  })
  .strict()

export const ListSeriesRequestQuerySchema = z
  .object({
    seriesId: zObjectId('seriesId phải là ObjectId hợp lệ').optional(),
    status: zEnum(SeriesRequestStatus, 'SeriesRequestStatus').optional(),
    requestType: zEnum(SeriesRequestType, 'SeriesRequestType').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0)
  })
  .strict()

export const SeriesRequestResSchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  requestedBy: z.string(),
  requestType: zEnumString(SeriesRequestType, 'SeriesRequestType'),
  reason: z.string(),
  expectedReturnDate: z.string().nullable(),
  proposedEndingChapters: z.number().nullable(),
  status: zEnumString(SeriesRequestStatus, 'SeriesRequestStatus'),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  rejectReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const SeriesRequestListResSchema = z.object({
  items: z.array(SeriesRequestResSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number()
})

export type CreateSeriesRequestBodyType = z.infer<typeof CreateSeriesRequestBodySchema>
export type AcceptSeriesRequestBodyType = z.infer<typeof AcceptSeriesRequestBodySchema>
export type RejectSeriesRequestBodyType = z.infer<typeof RejectSeriesRequestBodySchema>
export type ListSeriesRequestQueryType = z.infer<typeof ListSeriesRequestQuerySchema>
