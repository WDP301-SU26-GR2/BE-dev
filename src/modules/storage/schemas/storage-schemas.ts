import { extendApi } from '@anatine/zod-openapi'
import { AssetType } from '@prisma/client'
import { z } from 'zod'
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from '../storage.constant'

export const SignUploadBodySchema = extendApi(
  z
    .object({
      fileName: z.string().min(1).max(255),
      contentType: z.enum(ALLOWED_CONTENT_TYPES),
      contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
      assetType: z.nativeEnum(AssetType).optional()
    })
    .strict(),
  { title: 'SignUploadBody', description: 'Request body for presigned PUT upload' }
)

export const SignUploadResSchema = extendApi(
  z.object({
    assetId: z.string(),
    key: z.string(),
    uploadUrl: z.string(),
    requiredHeaders: z.record(z.string(), z.string()),
    expiresAt: z.string()
  }),
  { title: 'SignUploadRes', description: 'Presigned upload payload' }
)

export const SignDownloadBodySchema = extendApi(
  z
    .object({
      key: z.string().min(1)
    })
    .strict(),
  { title: 'SignDownloadBody', description: 'Request body for presigned GET download' }
)

export const SignDownloadResSchema = extendApi(
  z.object({
    downloadUrl: z.string(),
    expiresAt: z.string()
  }),
  { title: 'SignDownloadRes', description: 'Presigned download payload' }
)

export type SignUploadBodyType = z.infer<typeof SignUploadBodySchema>
export type SignDownloadBodyType = z.infer<typeof SignDownloadBodySchema>
