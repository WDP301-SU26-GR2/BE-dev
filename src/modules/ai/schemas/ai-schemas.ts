import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { AI_PROPOSED_REGIONS_MAX } from '../ai.constant'

const CoordinatesSchema = z
  .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
  .describe('Pixel bbox coordinates, top-left origin')

export const ProposedRegionSchema = z.object({
  regionType: zEnum($Enums.RegionType, 'RegionType'),
  detectedSubtype: z.string().nullable(),
  coordinates: CoordinatesSchema,
  confidenceScore: z.number().min(0).max(1)
})

export const SegmentPageBodySchema = extendApi(
  z.object({ mode: zEnum($Enums.AiSegmentMode, 'AiSegmentMode').default('MODEL') }).strict(),
  { title: 'SegmentPageBody', description: 'Run async AI segmentation on one page and return a job id' }
)

export const AiJobResSchema = extendApi(
  z.object({
    id: z.string(),
    type: zEnum($Enums.AiJobType, 'AiJobType'),
    mode: zEnum($Enums.AiSegmentMode, 'AiSegmentMode').nullable(),
    pageId: z.string(),
    status: zEnum($Enums.AiJobStatus, 'AiJobStatus'),
    error: z.string().nullable().describe('Error message when FAILED'),
    modelVersion: z.string().nullable(),
    proposedRegions: z.array(ProposedRegionSchema).nullable().describe('Returned only on job detail route'),
    regionCount: z.number().nullable(),
    appliedAt: z.string().nullable().describe('ISO timestamp; latest applied job is the active proposal'),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    durationMs: z.number().nullable().describe('Inference duration in milliseconds'),
    createdAt: z.string()
  }),
  { title: 'AiJobRes', description: 'One proposal-first AI job' }
)

export const AiJobListItemSchema = AiJobResSchema.omit({ proposedRegions: true })
export const AiJobListResSchema = extendApi(z.object({ items: z.array(AiJobListItemSchema) }), {
  title: 'AiJobListRes',
  description: 'AI job list for one page without proposedRegions payload'
})

export const SegmentAcceptedResSchema = extendApi(
  z.object({ jobId: z.string(), status: zEnum($Enums.AiJobStatus, 'AiJobStatus') }),
  { title: 'SegmentAcceptedRes', description: 'Queued segmentation job; poll GET /ai-jobs/:id' }
)

export const ApplyAiJobResSchema = extendApi(
  z.object({
    message: z.string(),
    created: z.number(),
    removed: z.number().describe('Previous bare AI regions removed'),
    skipped: z.number().describe('AI regions kept because they are confirmed or task-linked')
  }),
  { title: 'ApplyAiJobRes', description: 'Result of applying proposed regions into Region collection' }
)

export const ListAiJobsQuerySchema = extendApi(
  z.object({ type: zEnum($Enums.AiJobType, 'AiJobType').default('SEGMENT') }).strict(),
  { title: 'ListAiJobsQuery' }
)

export const AiServiceRegionSchema = z.object({
  type: z.enum(['PANEL', 'SPEECH_BUBBLE', 'CHARACTER']),
  subtype: z.string().optional(),
  bbox: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive()
  }),
  confidence: z.number().min(0).max(1)
})

export const AiSegmentResponseSchema = z.object({
  modelVersion: z.string().min(1),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  regions: z.array(AiServiceRegionSchema).max(AI_PROPOSED_REGIONS_MAX)
})

export type ProposedRegionType = z.infer<typeof ProposedRegionSchema>
export type SegmentPageBodyType = z.infer<typeof SegmentPageBodySchema>
export type ListAiJobsQueryType = z.infer<typeof ListAiJobsQuerySchema>
export type AiSegmentResponseType = z.infer<typeof AiSegmentResponseSchema>
