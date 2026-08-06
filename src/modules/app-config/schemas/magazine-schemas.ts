import { extendApi } from '@anatine/zod-openapi'
import { PublicationType } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { normalizeMagazine } from 'src/core/http/schemas/magazine.schema'

const pubTypesSchema = z
  .array(zEnum(PublicationType, 'PublicationType'))
  .min(1, { message: 'Phải chọn ít nhất một nhịp phát hành' })
  .refine((v) => new Set(v).size === v.length, { message: 'Nhịp phát hành bị trùng' })

export const CreateMagazineBodySchema = extendApi(
  z
    .object({
      name: z
        .string()
        .min(1, { message: 'Tên tạp chí là bắt buộc' })
        .max(100, { message: 'Tên tạp chí không được quá 100 ký tự' })
        .transform(normalizeMagazine)
        .refine((v) => v.length > 0, { message: 'Tên tạp chí là bắt buộc' }),
      publicationTypes: pubTypesSchema
    })
    .strict(),
  { title: 'CreateMagazineBody', description: 'Super Admin thêm tạp chí vào danh mục' }
)

export const UpdateMagazineBodySchema = extendApi(z.object({ publicationTypes: pubTypesSchema }).strict(), {
  title: 'UpdateMagazineBody',
  description: 'Super Admin sửa nhịp phát hành tạp chí chấp nhận'
})

export const MagazineEntryResSchema = extendApi(
  z.object({
    name: z.string(),
    publicationTypes: z.array(zEnum(PublicationType, 'PublicationType'))
  }),
  { title: 'MagazineEntryRes', description: 'Thông tin tạp chí' }
)

export const MagazineListResSchema = extendApi(
  z.object({
    items: z.array(
      z.object({
        name: z.string(),
        publicationTypes: z.array(zEnum(PublicationType, 'PublicationType'))
      })
    )
  }),
  { title: 'MagazineListRes', description: 'Danh mục tạp chí của nhà xuất bản' }
)
