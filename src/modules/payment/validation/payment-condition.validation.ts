import { BadRequestException } from '@nestjs/common'
import { ConditionType } from '@prisma/client'
import { z } from 'zod'
import { PaymentMessages } from '../payment.messages'

const ChapterMilestoneThresholdSchema = z
  .object({
    chapter: z.number({ error: 'chapter phải là số' }).int().positive()
  })
  .strict()

const RecurringChapterThresholdSchema = z
  .object({
    every: z.number({ error: 'every phải là số' }).int().positive()
  })
  .strict()

const RankingMilestoneThresholdSchema = z
  .object({
    topRank: z.number({ error: 'topRank phải là số' }).int().positive()
  })
  .strict()

const TimeBoundThresholdSchema = z
  .object({
    deadline: z
      .string({ error: 'deadline là bắt buộc' })
      .min(1)
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'deadline phải có định dạng YYYY-MM-DD' })
  })
  .strict()

const thresholdSchemaByType: Record<ConditionType, z.ZodTypeAny> = {
  [ConditionType.CHAPTER_MILESTONE]: ChapterMilestoneThresholdSchema,
  [ConditionType.RECURRING_CHAPTER]: RecurringChapterThresholdSchema,
  [ConditionType.RANKING_MILESTONE]: RankingMilestoneThresholdSchema,
  [ConditionType.TIME_BOUND]: TimeBoundThresholdSchema
}

export function parseThresholdConfig(conditionType: ConditionType, thresholdConfig: unknown) {
  const schema = thresholdSchemaByType[conditionType]
  const result = schema.safeParse(thresholdConfig)

  if (!result.success) {
    throw new BadRequestException(PaymentMessages.error.invalidThresholdConfig)
  }

  return result.data
}

export function assertRecurringChapterIsRecurring(conditionType: ConditionType, isRecurring: boolean) {
  if (conditionType === ConditionType.RECURRING_CHAPTER && !isRecurring) {
    throw new BadRequestException(PaymentMessages.error.recurringChapterRequiresRecurring)
  }
}
