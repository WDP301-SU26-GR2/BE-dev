import { $Enums } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zObjectId } from 'src/core/http/schemas/object-id.schema'

export const StageAnalyticsSchema = z.object({
  taskCount: z.number(),
  approvedCount: z.number(),
  openCount: z.number(),
  totalTaskDurationMs: z.number(),
  avgTaskDurationMs: z.number(),
  lateTaskCount: z.number(),
  stageDurationMs: z.number().nullable(),
  longestTask: z
    .object({
      taskId: z.string(),
      taskType: z.string().nullable(),
      assistantId: z.string().nullable(),
      durationMs: z.number()
    })
    .nullable()
})

export const ProductionStageResSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  order: z.number(),
  name: z.string(),
  taskTypes: z.array(zEnum($Enums.Specialization, 'Specialization')),
  isFinalCheck: z.boolean(),
  status: zEnum($Enums.ProductionStageStatus, 'ProductionStageStatus'),
  deadline: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  analytics: StageAnalyticsSchema,
  warnings: z.array(z.string()).optional()
})

export const StageListResSchema = z.object({
  stages: z.array(ProductionStageResSchema),
  currentStage: z.object({ id: z.string(), name: z.string(), order: z.number() }).nullable(),
  bottleneckStage: z.object({ stageId: z.string(), name: z.string(), stageDurationMs: z.number() }).nullable()
})

export const UpdateStageBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    deadline: z.string().datetime({ offset: true }).nullish()
  })
  .strict()

export const CreateStageBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    taskTypes: z.array(zEnum($Enums.Specialization, 'Specialization')).default([]),
    afterStageId: zObjectId()
  })
  .strict()

export const StagePageResSchema = z.object({
  stageId: z.string(),
  pageId: z.string(),
  inputSourceType: zEnum($Enums.AiSegmentSource, 'AiSegmentSource'),
  inputFileKey: z.string(),
  inputRevision: z.number().int(),
  outputSourceType: zEnum($Enums.AiSegmentSource, 'AiSegmentSource').nullable(),
  outputFileKey: z.string().nullable(),
  outputRevision: z.number().int().nullable(),
  outputConfirmedAt: z.string().nullable(),
  outputConfirmedBy: z.string().nullable(),
  outputReady: z.boolean()
})

export const StagePageListResSchema = z.object({ items: z.array(StagePageResSchema) })

export const StageReopenResSchema = z.object({
  message: z.string(),
  stageId: z.string().describe('Stage vừa được mở lại, nay ở ACTIVE'),
  relockedStageIds: z.array(z.string()).describe('Các stage phía sau đã bị đưa về LOCKED'),
  clearedStagePages: z.number().int().describe('Số ProductionStagePage của các stage phía sau đã bị xoá')
})

const StageOutputItemSchema = z
  .object({
    pageId: zObjectId(),
    fileKey: z.string().min(1).optional(),
    reuseInput: z.literal(true).optional()
  })
  .strict()
  .refine((value) => Boolean(value.fileKey) !== Boolean(value.reuseInput), {
    message: 'Phải chọn đúng một nguồn đầu ra'
  })

export const ConfirmStageOutputsBodySchema = z
  .object({ items: z.array(StageOutputItemSchema).min(1).max(200) })
  .strict()

export type UpdateStageBodyType = z.infer<typeof UpdateStageBodySchema>
export type CreateStageBodyType = z.infer<typeof CreateStageBodySchema>
export type ConfirmStageOutputsBodyType = z.infer<typeof ConfirmStageOutputsBodySchema>
