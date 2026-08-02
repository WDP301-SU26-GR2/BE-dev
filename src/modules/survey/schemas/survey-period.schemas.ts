import { extendApi } from '@anatine/zod-openapi'
import { PublicationType, SurveyStatus } from '@prisma/client'
import z from 'zod'
import { zDateField } from 'src/core/http/docs/date-docs'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zObjectId } from 'src/core/http/schemas/object-id.schema'

const SurveyCreateStatusSchema = zEnum(SurveyStatus, 'SurveyStatus').refine(
  (status): status is typeof SurveyStatus.DRAFT | typeof SurveyStatus.OPEN | typeof SurveyStatus.CLOSED =>
    status !== SurveyStatus.REFLECTED,
  { message: 'status chỉ được là DRAFT, OPEN hoặc CLOSED khi tạo kỳ bình chọn.' }
)

const SurveyUpdateStatusSchema = zEnum(SurveyStatus, 'SurveyStatus').refine(
  (status): status is typeof SurveyStatus.OPEN | typeof SurveyStatus.CLOSED =>
    status === SurveyStatus.OPEN || status === SurveyStatus.CLOSED,
  { message: 'status chỉ được là OPEN, CLOSED hoặc REFLECTED khi cập nhật kỳ bình chọn.' }
)

export const CreateSurveyPeriodBodySchema = extendApi(
  z
    .object({
      issueNumber: z.number().int().positive(),
      reflectedIssueNumber: z.number().int().positive().optional(),
      magazine: z.string().trim().min(1, { message: 'Thiếu thông tin tạp chí' }),
      publicationType: zEnum(PublicationType, 'PublicationType'),
      eligibleSeriesIds: z
        .array(zObjectId('Mã bộ truyện tham gia không hợp lệ'))
        .min(1, { message: 'Phải chọn ít nhất một bộ truyện tham gia kỳ bình chọn' })
        .refine((ids) => new Set(ids).size === ids.length, {
          message: 'Danh sách bộ truyện tham gia bị trùng'
        }),
      startDate: z.string().datetime({ message: 'startDate phải là chuỗi ISO 8601.' }),
      endDate: z.string().datetime({ message: 'endDate phải là chuỗi ISO 8601.' }),
      status: SurveyCreateStatusSchema.optional()
    })
    .strict()
    .refine((body) => new Date(body.startDate) < new Date(body.endDate), {
      message: 'Ngày bắt đầu phải trước ngày kết thúc',
      path: ['endDate']
    }),
  { title: 'CreateSurveyPeriodBody', description: 'Editor tạo kỳ bình chọn mới' }
)

export const UpdateSurveyPeriodStatusBodySchema = extendApi(z.object({ status: SurveyUpdateStatusSchema }).strict(), {
  title: 'UpdateSurveyPeriodStatusBody',
  description: 'Editor cập nhật trạng thái kỳ bình chọn'
})

export const ImportSurveyDataBodySchema = extendApi(
  z
    .object({
      surveyPeriodId: z.string().min(1, { message: 'surveyPeriodId là bắt buộc.' }),
      issueNumber: z.number().int().positive().optional(),
      reflectedIssueNumber: z.number().int().positive().optional(),
      surveyDate: z.string().datetime({ message: 'surveyDate phải là chuỗi ISO 8601.' }).optional(),
      entries: z
        .array(
          z
            .object({
              seriesId: z.string().min(1, { message: 'seriesId là bắt buộc.' }),
              voteCount: z.number().int().min(0, { message: 'voteCount phải >= 0.' })
            })
            .strict()
        )
        .min(1, { message: 'Phải có ít nhất một entry.' })
    })
    .strict(),
  { title: 'ImportSurveyDataBody', description: 'Editor nhập vote offline từ postcard' }
)

export const SurveyPeriodResSchema = extendApi(
  z
    .object({
      id: z.string(),
      magazine: z.string().nullable(),
      publicationType: zEnum(PublicationType, 'PublicationType').nullable(),
      eligibleSeriesIds: z.array(z.string()),
      issueNumber: z.number().int().optional(),
      reflectedIssueNumber: z.number().int().optional(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      status: zEnum(SurveyStatus, 'SurveyStatus')
    })
    .strict(),
  { title: 'SurveyPeriodRes', description: 'Chi tiết kỳ bình chọn' }
)

export const SurveyDataEntryResSchema = extendApi(
  z.object({ seriesId: z.string().nullable(), voteCount: z.number().int() }).strict(),
  { title: 'SurveyDataEntryRes', description: 'Một entry vote offline' }
)

export const SurveyDataResSchema = extendApi(
  z
    .object({
      id: z.string(),
      surveyPeriodId: z.string(),
      importedBy: z.string().nullable(),
      surveyDate: zDateField().nullable(),
      importedAt: zDateField(),
      entries: z.array(SurveyDataEntryResSchema)
    })
    .strict(),
  { title: 'SurveyDataRes', description: 'Một lần nhập vote offline' }
)

export const SurveyDataListResSchema = extendApi(z.object({ data: z.array(SurveyDataResSchema) }).strict(), {
  title: 'SurveyDataListRes',
  description: 'Danh sách dữ liệu vote offline'
})
